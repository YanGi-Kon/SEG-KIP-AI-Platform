import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeDatabaseBackup } from '../services/databaseBackupWriter.js';

test('backup streams multiple cursor batches and preserves restore format', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'db-export-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const calls = []; let fetches = 0; let released = false;
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes('pg_tables')) return { rows: [{ tablename: 'items' }, { tablename: 'empty' }] };
      if (sql.includes('current_database')) return { rows: [{ name: 'testdb' }] };
      if (sql.startsWith('FETCH')) return {
        fields: [{ name: 'id' }, { name: 'data' }],
        rows: ++fetches <= 2 ? [{ id: fetches, data: 'quote " and newline\n' }] : [],
      };
      return { rows: [] };
    },
    release() { released = true; },
  };
  const filepath = path.join(dir, 'backup.json');
  await writeDatabaseBackup({ connect: async () => client }, filepath);
  const backup = JSON.parse(await fs.readFile(filepath, 'utf8'));
  assert.equal(backup.database, 'testdb');
  assert.equal(backup.meta.totalTables, 2);
  assert.equal(backup.tables.items.rowCount, 2);
  assert.equal(backup.tables.items.rows[1].data, 'quote " and newline\n');
  assert.deepEqual(backup.tables.empty, { columns: ['id', 'data'], rows: [], rowCount: 0 });
  assert.equal(calls.at(-1), 'COMMIT');
  assert.ok(released);
});

test('failed exports roll back and release the database connection', async () => {
  const calls = []; let released = false;
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes('pg_tables')) throw new Error('read failed');
      return { rows: [] };
    },
    release() { released = true; },
  };
  await assert.rejects(writeDatabaseBackup({ connect: async () => client }, 'unused.json'), /read failed/);
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.ok(released);
});
