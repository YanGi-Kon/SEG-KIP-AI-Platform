const ROLE_PERMISSIONS = Object.freeze({
  owner: new Set([
    'workspace:read', 'workspace:update', 'workspace:archive', 'workspace:test',
    'members:read', 'members:create', 'members:update', 'members:delete',
    'signers:read', 'signers:create', 'signers:update', 'signers:delete',
    'documents:read', 'documents:create', 'documents:send', 'documents:cancel',
    'audit:read',
  ]),
  administrator: new Set([
    'workspace:read', 'workspace:update', 'workspace:test',
    'members:read', 'members:create', 'members:update', 'members:delete',
    'signers:read', 'signers:create', 'signers:update', 'signers:delete',
    'documents:read', 'documents:create', 'documents:send', 'documents:cancel',
    'audit:read',
  ]),
  operator: new Set([
    'workspace:read',
    'signers:read',
    'documents:read', 'documents:create', 'documents:send',
  ]),
  engineer: new Set([
    'workspace:read',
    'signers:read',
    'documents:read', 'documents:create',
  ]),
  department_manager: new Set([
    'workspace:read',
    'signers:read',
    'documents:read', 'documents:send',
    'audit:read',
  ]),
  viewer: new Set([
    'workspace:read',
    'signers:read',
    'documents:read',
  ]),
});

export function hasWorkspacePermission(role, permission) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  const normalizedPermission = String(permission || '').trim();
  return Boolean(ROLE_PERMISSIONS[normalizedRole]?.has(normalizedPermission));
}

export function requirePermission(role, permission) {
  if (!hasWorkspacePermission(role, permission)) {
    const error = new Error(`Workspace permission denied: ${permission}`);
    error.code = 'WORKSPACE_PERMISSION_DENIED';
    error.statusCode = 403;
    throw error;
  }
  return true;
}

export function canManageRole(actorRole, targetRole) {
  const rank = {
    owner: 6,
    administrator: 5,
    department_manager: 4,
    operator: 3,
    engineer: 2,
    viewer: 1,
  };
  const actor = rank[String(actorRole || '').toLowerCase()] || 0;
  const target = rank[String(targetRole || '').toLowerCase()] || 0;
  if (String(targetRole || '').toLowerCase() === 'owner') return false;
  return actor >= rank.administrator && actor > target;
}

export function listRolePermissions(role) {
  return [...(ROLE_PERMISSIONS[String(role || '').toLowerCase()] || [])].sort();
}
