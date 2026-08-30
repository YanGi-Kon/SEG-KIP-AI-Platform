import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalize,
  omitExcludedColumns,
  parseArguments,
  quoteIdentifier,
  topologicalTableOrder,
  validateBackup,
} from '../scripts/restore-db-backup.mjs';

test('quoteIdentifier escapes embedded quotes', () => {
  assert.equal(quoteIdentifier('safe"name'), '"safe""name"');
});

test('canonicalize treats PostgreSQL wall-clock timestamps as UTC backup timestamps', () => {
  assert.equal(
    canonicalize('2026-08-18 20:00:00.158'),
    canonicalize('2026-08-18T20:00:00.158Z'),
  );
});

test('parseArguments defaults to dry-run', () => {
  assert.deepEqual(
    parseArguments(['--backup', 'backup.json', '--target-url-file', 'target.txt']),
    {
      apply: false,
      allowNonempty: false,
      backupPath: 'backup.json',
      targetUrlFile: 'target.txt',
    },
  );
});

test('validateBackup rejects row-count mismatches', () => {
  assert.throws(
    () => validateBackup({
      tables: {
        users: { columns: ['id'], rowCount: 2, rows: [{ id: 'one' }] },
      },
    }),
    /rowCount does not match/,
  );
});

test('omitExcludedColumns removes only configured legacy fields', () => {
  const backup = validateBackup({
    tables: {
      workspaces: {
        columns: ['id', 'legacy_value', 'name'],
        rowCount: 1,
        rows: [{ id: 'one', legacy_value: 'old', name: 'Workspace' }],
      },
    },
  });
  assert.deepEqual(
    omitExcludedColumns(backup, { workspaces: ['legacy_value'] }).tables.workspaces,
    {
      columns: ['id', 'name'],
      rowCount: 1,
      rows: [{ id: 'one', name: 'Workspace' }],
    },
  );
});

test('topologicalTableOrder places parents before children', () => {
  assert.deepEqual(
    topologicalTableOrder(
      ['workspace_members', 'workspaces', 'users'],
      [
        { child: 'workspaces', parent: 'users' },
        { child: 'workspace_members', parent: 'workspaces' },
        { child: 'workspace_members', parent: 'users' },
      ],
    ),
    ['users', 'workspaces', 'workspace_members'],
  );
});

test('topologicalTableOrder reports cycles', () => {
  assert.throws(
    () => topologicalTableOrder(
      ['left_table', 'right_table'],
      [
        { child: 'left_table', parent: 'right_table' },
        { child: 'right_table', parent: 'left_table' },
      ],
    ),
    /cycle detected/,
  );
});
