import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { migrationChecksum } from '../db/migrate.js';

const migrationFiles = [
  new URL('../db/migrations/001_core_identity.sql', import.meta.url),
  new URL('../db/migrations/002_workflow.sql', import.meta.url),
];

test('migration files leave transaction boundaries to the runner', async () => {
  for (const file of migrationFiles) {
    const sql = await fs.readFile(file, 'utf8');
    assert.equal(/^\s*BEGIN\s*;/i.test(sql), false);
    assert.equal(/COMMIT\s*;\s*$/i.test(sql), false);
  }
});

test('migration checksums are stable across operating-system line endings', () => {
  const lf = 'CREATE TABLE example (id integer);\n-- next statement\n';
  const crlf = lf.replace(/\n/g, '\r\n');

  assert.equal(migrationChecksum(crlf), migrationChecksum(lf));
});

test('core migration contains tenant identity tables', async () => {
  const sql = await fs.readFile(migrationFiles[0], 'utf8');
  for (const table of ['users', 'workspaces', 'workspace_members', 'refresh_sessions']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'));
  }
});

test('workflow migration contains tenant-scoped workflow tables', async () => {
  const sql = await fs.readFile(migrationFiles[1], 'utf8');
  for (const table of ['signers', 'documents', 'approvals', 'audit_logs', 'outbox_jobs']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'));
  }
  assert.match(sql, /workspace_id uuid NOT NULL REFERENCES workspaces/i);
});

test('final PDF migration adds export job states and diagnostics', async () => {
  const sql = await fs.readFile(new URL('../db/migrations/025_final_pdf_export_outbox.sql', import.meta.url), 'utf8');
  assert.match(sql, /final_pdf_export/i);
  assert.match(sql, /failed_retryable/i);
  assert.match(sql, /failed_permanent/i);
  assert.match(sql, /last_error_code/i);
});
