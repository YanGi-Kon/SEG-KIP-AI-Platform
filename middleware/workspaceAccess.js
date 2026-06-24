import { hasWorkspacePermission } from '../domain/permissions.js';
import { findWorkspaceForUser } from '../repositories/workspaceRepository.js';

export function requireWorkspacePermission(permission) {
  return async (req, res, next) => {
    const workspaceId = String(req.params.workspaceId || '').trim();
    if (!workspaceId) {
      return res.status(400).json({
        error: 'workspaceId is required',
        code: 'WORKSPACE_ID_REQUIRED',
      });
    }

    try {
      const workspace = await findWorkspaceForUser(workspaceId, req.auth?.userId);
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
    } catch (error) {
      res.status(500).json({
        error: 'Workspace authorization failed',
        code: 'WORKSPACE_AUTHORIZATION_ERROR',
      });
    }
  };
}
