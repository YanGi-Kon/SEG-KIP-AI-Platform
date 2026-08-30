import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import pg from 'pg';

const { Client, types } = pg;

// Preserve PostgreSQL `timestamp without time zone` as a wall-clock string.
// The default pg parser applies the local machine time zone and can make an
// otherwise identical backup value appear several hours different.
types.setTypeParser(1114, (value) => value);

export const DEFAULT_EXCLUDED_TABLES = Object.freeze([
  'refresh_sessions',
  'schema_migrations',
]);

// These columns existed in the source database but are no longer read by the
// application. Current credentials are stored in service_account_base64.
export const DEFAULT_EXCLUDED_COLUMNS = Object.freeze({
  workspaces: Object.freeze([
    'service_account_encrypted_json',
    'service_account_client_email',
    'service_account_project_id',
    'service_account_status',
    'service_account_updated_at',
  ]),
});

function usage() {
  return [
    'Usage:',
    '  node scripts/restore-db-backup.mjs --backup <file> [--target-url-file <file>] [--apply]',
    '',
    'Connection:',
    '  Set TARGET_DATABASE_URL, or pass a file containing only the target URL.',
    '',
    'Safety:',
    '  The default mode is dry-run. --apply writes in one transaction.',
    '  --apply refuses a non-empty target unless --allow-nonempty is also present.',
    `  Excluded by default: ${DEFAULT_EXCLUDED_TABLES.join(', ')}`,
    '  Legacy workspace service-account metadata columns are excluded explicitly.',
  ].join('\n');
}

export function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function parseArguments(argv) {
  const options = {
    apply: false,
    allowNonempty: false,
    backupPath: '',
    targetUrlFile: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') {
      options.apply = true;
    } else if (argument === '--allow-nonempty') {
      options.allowNonempty = true;
    } else if (argument === '--backup') {
      options.backupPath = String(argv[index + 1] || '');
      index += 1;
    } else if (argument === '--target-url-file') {
      options.targetUrlFile = String(argv[index + 1] || '');
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

export function validateBackup(backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    throw new Error('Backup root must be a JSON object');
  }
  if (!backup.tables || typeof backup.tables !== 'object' || Array.isArray(backup.tables)) {
    throw new Error('Backup must contain a tables object');
  }

  const normalizedTables = {};
  for (const [tableName, table] of Object.entries(backup.tables)) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
      throw new Error(`Unsafe table name in backup: ${tableName}`);
    }
    if (!table || typeof table !== 'object' || table.error) {
      throw new Error(`Backup table ${tableName} contains an export error`);
    }
    if (!Array.isArray(table.columns) || !Array.isArray(table.rows)) {
      throw new Error(`Backup table ${tableName} must contain columns and rows arrays`);
    }
    if (Number(table.rowCount) !== table.rows.length) {
      throw new Error(`Backup table ${tableName} rowCount does not match rows.length`);
    }

    const columns = table.columns.map((column) => String(column));
    if (new Set(columns).size !== columns.length) {
      throw new Error(`Backup table ${tableName} contains duplicate columns`);
    }
    for (const column of columns) {
      if (!/^[a-z_][a-z0-9_]*$/i.test(column)) {
        throw new Error(`Unsafe column name in backup: ${tableName}.${column}`);
      }
    }
    for (const [rowIndex, row] of table.rows.entries()) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(`Backup table ${tableName} row ${rowIndex} is invalid`);
      }
      const unexpected = Object.keys(row).filter((column) => !columns.includes(column));
      if (unexpected.length) {
        throw new Error(`Backup table ${tableName} row ${rowIndex} has unexpected columns: ${unexpected.join(', ')}`);
      }
    }

    normalizedTables[tableName] = {
      columns,
      rows: table.rows,
      rowCount: table.rows.length,
    };
  }

  return {
    createdAt: backup.createdAt || null,
    tables: normalizedTables,
  };
}

export function omitExcludedColumns(backup, exclusions = DEFAULT_EXCLUDED_COLUMNS) {
  const tables = {};
  for (const [tableName, table] of Object.entries(backup.tables)) {
    const excluded = new Set(exclusions[tableName] || []);
    const columns = table.columns.filter((column) => !excluded.has(column));
    tables[tableName] = {
      ...table,
      columns,
      rows: table.rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))),
    };
  }
  return { ...backup, tables };
}

export function topologicalTableOrder(tableNames, foreignKeys) {
  const names = [...new Set(tableNames)].sort();
  const included = new Set(names);
  const dependencies = new Map(names.map((name) => [name, new Set()]));

  for (const relation of foreignKeys) {
    if (included.has(relation.child) && included.has(relation.parent) && relation.child !== relation.parent) {
      dependencies.get(relation.child).add(relation.parent);
    }
  }

  const ordered = [];
  const remaining = new Set(names);
  while (remaining.size) {
    const ready = [...remaining]
      .filter((name) => [...dependencies.get(name)].every((dependency) => !remaining.has(dependency)))
      .sort();
    if (!ready.length) {
      throw new Error(`Foreign-key cycle detected among: ${[...remaining].sort().join(', ')}`);
    }
    for (const name of ready) {
      remaining.delete(name);
      ordered.push(name);
    }
  }
  return ordered;
}

function normalizeTimestamp(value) {
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(text)) return null;
  const isoLike = text.replace(' ', 'T');
  const hasTimeZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(isoLike);
  const parsed = new Date(hasTimeZone ? isoLike : `${isoLike}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return normalizeTimestamp(value) || value;
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function canonicalRows(rows, primaryKey) {
  return [...rows]
    .map(canonicalize)
    .sort((left, right) => String(left[primaryKey]).localeCompare(String(right[primaryKey])));
}

async function loadTargetUrl(options) {
  if (options.targetUrlFile) {
    return String(await fs.readFile(path.resolve(options.targetUrlFile), 'utf8')).trim();
  }
  return String(process.env.TARGET_DATABASE_URL || '').trim();
}

async function inspectTarget(client, tables) {
  const tableResult = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const columnsByTable = new Map();
  for (const row of tableResult.rows) {
    if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, []);
    columnsByTable.get(row.table_name).push(row.column_name);
  }

  const primaryKeyResult = await client.query(`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.constraint_schema = tc.constraint_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position
  `);
  const primaryKeys = new Map();
  for (const row of primaryKeyResult.rows) {
    if (!primaryKeys.has(row.table_name)) primaryKeys.set(row.table_name, []);
    primaryKeys.get(row.table_name).push(row.column_name);
  }

  const foreignKeyResult = await client.query(`
    SELECT child.relname AS child, parent.relname AS parent
    FROM pg_constraint constraint_row
    JOIN pg_class child ON child.oid = constraint_row.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = constraint_row.confrelid
    WHERE constraint_row.contype = 'f'
      AND child_ns.nspname = 'public'
  `);

  const counts = {};
  for (const tableName of tables) {
    if (!columnsByTable.has(tableName)) continue;
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(tableName)}`);
    counts[tableName] = result.rows[0].count;
  }

  return {
    columnsByTable,
    counts,
    foreignKeys: foreignKeyResult.rows,
    primaryKeys,
  };
}

function validateCompatibility(backup, target, includedTables) {
  for (const tableName of includedTables) {
    const targetColumns = target.columnsByTable.get(tableName);
    if (!targetColumns) throw new Error(`Target database is missing table: ${tableName}`);
    const missingColumns = backup.tables[tableName].columns.filter((column) => !targetColumns.includes(column));
    if (missingColumns.length) {
      throw new Error(`Target table ${tableName} is missing columns: ${missingColumns.join(', ')}`);
    }
    const primaryKey = target.primaryKeys.get(tableName) || [];
    if (primaryKey.length !== 1) {
      throw new Error(`Target table ${tableName} must have exactly one primary-key column`);
    }
    if (!backup.tables[tableName].columns.includes(primaryKey[0])) {
      throw new Error(`Backup table ${tableName} does not contain primary key ${primaryKey[0]}`);
    }
  }
}

async function upsertTable(client, tableName, table, primaryKey) {
  if (!table.rows.length) return 0;
  const columnsSql = table.columns.map(quoteIdentifier).join(', ');
  const parametersSql = table.columns.map((_, index) => `$${index + 1}`).join(', ');
  const updatedColumns = table.columns.filter((column) => column !== primaryKey);
  const conflictSql = updatedColumns.length
    ? `DO UPDATE SET ${updatedColumns.map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`).join(', ')}`
    : 'DO NOTHING';
  const sql = `
    INSERT INTO ${quoteIdentifier(tableName)} (${columnsSql})
    VALUES (${parametersSql})
    ON CONFLICT (${quoteIdentifier(primaryKey)}) ${conflictSql}
  `;

  for (const row of table.rows) {
    await client.query(sql, table.columns.map((column) => row[column] ?? null));
  }
  return table.rows.length;
}

async function verifyTable(client, tableName, table, primaryKey) {
  if (!table.rows.length) return;
  const parameters = table.rows.map((_, index) => `$${index + 1}`).join(', ');
  const selected = await client.query(
    `SELECT ${table.columns.map(quoteIdentifier).join(', ')}
     FROM ${quoteIdentifier(tableName)}
     WHERE ${quoteIdentifier(primaryKey)} IN (${parameters})`,
    table.rows.map((row) => row[primaryKey]),
  );

  const expected = JSON.stringify(canonicalRows(table.rows, primaryKey));
  const actual = JSON.stringify(canonicalRows(selected.rows, primaryKey));
  if (actual !== expected) {
    throw new Error(`Post-write verification failed for table: ${tableName}`);
  }
}

export async function restoreBackup(options) {
  if (!options.backupPath) throw new Error('--backup is required');
  const targetUrl = await loadTargetUrl(options);
  if (!targetUrl) throw new Error('TARGET_DATABASE_URL or --target-url-file is required');
  if (!/^postgres(?:ql)?:\/\//i.test(targetUrl)) throw new Error('Target database URL is invalid');

  const backupPath = path.resolve(options.backupPath);
  const backup = omitExcludedColumns(
    validateBackup(JSON.parse(await fs.readFile(backupPath, 'utf8'))),
  );
  const excluded = new Set(DEFAULT_EXCLUDED_TABLES);
  const includedTables = Object.keys(backup.tables).filter((name) => !excluded.has(name));
  const includedRows = includedTables.reduce((total, name) => total + backup.tables[name].rowCount, 0);

  const client = new Client({
    connectionString: targetUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
    statement_timeout: 30_000,
    application_name: options.apply ? 'seg-kip-backup-restore' : 'seg-kip-backup-dry-run',
  });

  try {
    await client.connect();
    await client.query(options.apply ? 'BEGIN' : 'BEGIN READ ONLY');
    const target = await inspectTarget(client, includedTables);
    validateCompatibility(backup, target, includedTables);
    const order = topologicalTableOrder(includedTables, target.foreignKeys);
    const nonemptyTables = order.filter((name) => name !== 'platform_settings' && Number(target.counts[name] || 0) > 0);

    const report = {
      mode: options.apply ? 'apply' : 'dry-run',
      backup: path.basename(backupPath),
      backupCreatedAt: backup.createdAt,
      excludedTables: DEFAULT_EXCLUDED_TABLES,
      excludedColumns: DEFAULT_EXCLUDED_COLUMNS,
      includedRows,
      order,
      targetCounts: Object.fromEntries(order.map((name) => [name, target.counts[name] || 0])),
    };

    if (!options.apply) {
      await client.query('ROLLBACK');
      return report;
    }

    if (nonemptyTables.length && !options.allowNonempty) {
      throw new Error(
        `Target contains application data in: ${nonemptyTables.join(', ')}. `
        + 'Review it first; rerun with --allow-nonempty only when merging is intended.',
      );
    }

    if (order.length) {
      await client.query(`LOCK TABLE ${order.map(quoteIdentifier).join(', ')} IN SHARE ROW EXCLUSIVE MODE`);
    }
    for (const tableName of order) {
      const primaryKey = target.primaryKeys.get(tableName)[0];
      await upsertTable(client, tableName, backup.tables[tableName], primaryKey);
    }
    for (const tableName of order) {
      const primaryKey = target.primaryKeys.get(tableName)[0];
      await verifyTable(client, tableName, backup.tables[tableName], primaryKey);
    }

    await client.query('COMMIT');
    return { ...report, restoredRows: includedRows, verified: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const report = await restoreBackup(options);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(`[restore] ${error.message}`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  await main();
}
