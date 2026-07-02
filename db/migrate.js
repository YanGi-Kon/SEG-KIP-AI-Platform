import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { closePool, getPool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LOCK_KEY = 732451987;

function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
}

async function loadMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /^\d+.*\.sql$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'));

  return Promise.all(files.map(async (filename) => {
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');
    return { filename, sql, checksum: checksum(sql) };
  }));
}

export async function runMigrations({ dryRun = false } = {}) {
  const pool = getPool();
  const client = await pool.connect();
  const report = { dryRun, applied: [], skipped: [], pending: [] };

  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await ensureMigrationTable(client);

    const result = await client.query('SELECT filename, checksum FROM schema_migrations ORDER BY filename');
    const applied = new Map(result.rows.map((row) => [row.filename, row.checksum]));
    const migrations = await loadMigrationFiles();

    for (const migration of migrations) {
      const previousChecksum = applied.get(migration.filename);
      if (previousChecksum) {
        if (previousChecksum !== migration.checksum) {
          throw new Error(`Applied migration checksum mismatch: ${migration.filename}`);
        }
        report.skipped.push(migration.filename);
        continue;
      }

      report.pending.push(migration.filename);
      if (dryRun) continue;

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [migration.filename, migration.checksum],
        );
        await client.query('COMMIT');
        report.applied.push(migration.filename);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration failed (${migration.filename}): ${error.message}`);
      }
    }

    return report;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  try {
    const report = await runMigrations({ dryRun });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error('[migration]', error.message);
    process.exitCode = 1;
  } finally {
    await closePool().catch(() => {});
  }
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  await main();
}
