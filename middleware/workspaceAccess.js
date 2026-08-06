import { hasWorkspacePermission } from '../domain/permissions.js';
import { findWorkspaceForUser } from '../repositories/workspaceRepository.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authorizeWorkspace(permission, resolveWorkspaceId) {
  return async (req, res, next) => {
    const workspaceId = String(resolveWorkspaceId(req) || '').trim();
    if (!workspaceId) {
      return res.status(400).json({
        error: 'workspaceId is required',
        code: 'WORKSPACE_ID_REQUIRED',
      });
    }
    if (!UUID_PATTERN.test(workspaceId)) {
      return res.status(400).json({
        error: 'workspaceId format is invalid',
        code: 'INVALID_WORKSPACE_ID',
      });
    }

    try {
      const pRole = String(req.auth?.platformRole || '').toLowerCase();
      const isAdmin = pRole === 'super admin';
      
      let workspace;
      if (isAdmin) {
        const { findWorkspaceById } = await import('../repositories/workspaceRepository.js');
        workspace = await findWorkspaceById(workspaceId);
        if (workspace) {
          workspace.memberRole = 'owner';
          workspace.memberStatus = 'active';
        }
      } else {
        workspace = await findWorkspaceForUser(workspaceId, req.auth?.userId);
      }

      if (!workspace || workspace.memberStatus !== 'active' || workspace.status === 'archived') {
        return res.status(404).json({
          error: 'Workspace not found',
          code: 'WORKSPACE_NOT_FOUND',
        });
      }
      if (!hasWorkspacePermission(workspace.memberRole, permission)) {
        return res.status(403).json({
          error: `Workspace permission denied: ${permission}`,
          code: 'WORKSPACE_PERMISSION_DENIED',
        });
      }
      req.workspace = workspace;
      req.workspaceRole = workspace.memberRole;
      next();
    } catch (_) {
      res.status(500).json({
        error: 'Workspace authorization failed',
        code: 'WORKSPACE_AUTHORIZATION_ERROR',
      });
    }
  };
}

export function requireWorkspacePermission(permission) {
  return authorizeWorkspace(permission, (req) => req.params.workspaceId);
}

export function requireWorkspaceRequestPermission(permission) {
  return authorizeWorkspace(permission, (req) => (
    req.params.workspaceId
    || req.get('x-workspace-id')
    || req.body?.workspaceId
    || req.query?.workspaceId
  ));
}
