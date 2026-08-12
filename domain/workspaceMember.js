import { canManageRole } from './permissions.js';

export const WORKSPACE_MEMBER_ROLES = Object.freeze([
  'owner',
  'administrator',
  'operator',
  'viewer',
]);

export const ASSIGNABLE_WORKSPACE_MEMBER_ROLES = Object.freeze(
  WORKSPACE_MEMBER_ROLES.filter((role) => role !== 'owner'),
);

export const WORKSPACE_MEMBER_STATUSES = Object.freeze([
  'active',
  'disabled',
  'invited',
]);

function memberError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export function normalizeWorkspaceMemberRole(value, { allowOwner = false } = {}) {
  const role = String(value || '').trim().toLowerCase();
  const allowed = allowOwner ? WORKSPACE_MEMBER_ROLES : ASSIGNABLE_WORKSPACE_MEMBER_ROLES;
  if (!allowed.includes(role)) {
    throw memberError('Invalid workspace member role', 'INVALID_WORKSPACE_MEMBER_ROLE');
  }
  return role;
}

export function normalizeWorkspaceMemberStatus(value, { fallback = 'active' } = {}) {
  const status = String(value || fallback).trim().toLowerCase();
  if (!WORKSPACE_MEMBER_STATUSES.includes(status)) {
    throw memberError('Invalid workspace member status', 'INVALID_WORKSPACE_MEMBER_STATUS');
  }
  return status;
}

export function assertCanManageWorkspaceMember(actorRole, currentRole, targetRole = currentRole) {
  const current = normalizeWorkspaceMemberRole(currentRole, { allowOwner: true });
  const target = normalizeWorkspaceMemberRole(targetRole, { allowOwner: true });

  if (current === 'owner' || target === 'owner') {
    throw memberError('Workspace owner membership cannot be changed', 'WORKSPACE_OWNER_IMMUTABLE', 403);
  }
  if (!canManageRole(actorRole, current) || !canManageRole(actorRole, target)) {
    throw memberError('Workspace member role cannot be managed by this actor', 'WORKSPACE_MEMBER_ROLE_FORBIDDEN', 403);
  }
  return true;
}

export function assertCanAssignWorkspaceRole(actorRole, targetRole) {
  const target = normalizeWorkspaceMemberRole(targetRole);
  if (!canManageRole(actorRole, target)) {
    throw memberError('Workspace member role cannot be assigned by this actor', 'WORKSPACE_MEMBER_ROLE_FORBIDDEN', 403);
  }
  return true;
}
