import test from 'node:test';
import assert from 'node:assert/strict';
import { testWorkspaceSheetConnection } from '../services/workspaceGoogleService.js';

test('Workspace Google connector exports a callable connection check', () => {
  assert.equal(typeof testWorkspaceSheetConnection, 'function');
});
