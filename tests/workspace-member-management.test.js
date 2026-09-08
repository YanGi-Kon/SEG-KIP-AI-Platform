import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  assertCanAssignWorkspaceRole,
  assertCanManageWorkspaceMember,
  normalizeWorkspaceMemberRole,
  normalizeWorkspaceMemberStatus,
} from '../domain/workspaceMember.js';

test('workspace member role normalization follows the simplified role model and excludes owner assignments', () => {
  assert.equal(normalizeWorkspaceMemberRole(' Operator '), 'operator');
  assert.throws(
    () => normalizeWorkspaceMemberRole('department_manager'),
    (error) => error.code === 'INVALID_WORKSPACE_MEMBER_ROLE',
  );
  assert.throws(
    () => normalizeWorkspaceMemberRole('owner'),
    (error) => error.code === 'INVALID_WORKSPACE_MEMBER_ROLE',
  );
});

test('workspace member status accepts only persisted states', () => {
  assert.equal(normalizeWorkspaceMemberStatus(' invited '), 'invited');
  assert.throws(
    () => normalizeWorkspaceMemberStatus('removed'),
    (error) => error.code === 'INVALID_WORKSPACE_MEMBER_STATUS',
  );
});

test('owner and administrator can assign only roles below their own rank', () => {
  assert.equal(assertCanAssignWorkspaceRole('owner', 'administrator'), true);
  assert.equal(assertCanAssignWorkspaceRole('administrator', 'operator'), true);
  assert.throws(
    () => assertCanAssignWorkspaceRole('administrator', 'administrator'),
    (error) => error.code === 'WORKSPACE_MEMBER_ROLE_FORBIDDEN',
  );
});

test('owner membership is immutable and administrators cannot manage peers', () => {
  assert.throws(
    () => assertCanManageWorkspaceMember('owner', 'owner', 'owner'),
    (error) => error.code === 'WORKSPACE_OWNER_IMMUTABLE',
  );
  assert.throws(
    () => assertCanManageWorkspaceMember('administrator', 'administrator', 'viewer'),
    (error) => error.code === 'WORKSPACE_MEMBER_ROLE_FORBIDDEN',
  );
  assert.equal(assertCanManageWorkspaceMember('owner', 'administrator', 'viewer'), true);
});

test('workspace routes expose permission-guarded member mutations', async () => {
  const source = await fs.readFile(new URL('../routes/workspaces.js', import.meta.url), 'utf8');
  assert.match(source, /router\.post\('\/:workspaceId\/members', requireWorkspacePermission\('members:create'\)/);
  assert.match(source, /router\.put\('\/:workspaceId\/members\/:memberId', requireWorkspacePermission\('members:update'\)/);
  assert.match(source, /router\.delete\('\/:workspaceId\/members\/:memberId', requireWorkspacePermission\('members:delete'\)/);
});

test('workspace settings UI manages members through workspace-scoped endpoints', async () => {
  const source = await fs.readFile(new URL('../public/js/workspace-ui.js', import.meta.url), 'utf8');
  assert.match(source, /workspaceMemberAddForm/);
  assert.match(source, /\/members\/\$\{encodeURIComponent\(memberId\)\}/);
  assert.match(source, /memberAction === 'remove'/);
});

test('workspace member reads use the simplified platform_role schema', async () => {
  const source = await fs.readFile(new URL('../repositories/workspaceRepository.js', import.meta.url), 'utf8');
  const memberSection = source.slice(source.indexOf('export async function listWorkspaceMembers'));

  assert.match(memberSection, /u\.platform_role/);
  assert.doesNotMatch(memberSection, /JOIN system_roles sr ON sr\.id = u\.system_role_id/);
  assert.doesNotMatch(memberSection, /u\.system_role_id/);
});
