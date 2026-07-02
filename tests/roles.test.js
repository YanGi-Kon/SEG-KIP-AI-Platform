import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageRole, hasWorkspacePermission } from '../domain/permissions.js';

test('workspace roles have explicit access rules', () => {
  assert.equal(hasWorkspacePermission('owner', 'workspace:archive'), true);
  assert.equal(hasWorkspacePermission('administrator', 'workspace:archive'), false);
  assert.equal(hasWorkspacePermission('viewer', 'documents:read'), true);
  assert.equal(hasWorkspacePermission('viewer', 'documents:create'), false);
});

test('workspace owner role cannot be reassigned by lower roles', () => {
  assert.equal(canManageRole('owner', 'administrator'), true);
  assert.equal(canManageRole('administrator', 'operator'), true);
  assert.equal(canManageRole('administrator', 'owner'), false);
  assert.equal(canManageRole('operator', 'viewer'), false);
});
