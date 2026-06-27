import express from 'express';
import { requireAccessToken } from '../middleware/auth.js';
import { requireWorkspaceMode } from '../middleware/featureGate.js';
import { requireWorkspacePermission } from '../middleware/workspaceAccess.js';
import {
  archiveWorkspace,
  createWorkspace,
  getUserWorkspaces,
  getWorkspace,
  getWorkspaceMembers,
  updateWorkspace,
} from '../services/workspaceService.js';
import { testWorkspaceSheetConnection } from '../services/workspaceGoogleService.js';

const router = express.Router();

function handleError(res, error) {
  const knownStatus = Number(error.statusCode);
  const status = Number.isInteger(knownStatus) && knownStatus >= 400 && knownStatus < 600
    ? knownStatus
    : 500;
  res.status(status).json({
    error: status >= 500 ? 'Workspace service error' : error.message,
    code: error.code || (status >= 500 ? 'WORKSPACE_SERVICE_ERROR' : 'WORKSPACE_REQUEST_FAILED'),
  });
}

router.use(requireWorkspaceMode, requireAccessToken);

router.post('/', async (req, res) => {
  try {
    const workspace = await createWorkspace(req.auth.userId, req.body || {});
    res.status(201).json({ workspace });
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/', async (req, res) => {
  try {
    const rows = await getUserWorkspaces(req.auth.userId);
    res.json({ rows });
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:workspaceId', requireWorkspacePermission('workspace:read'), async (req, res) => {
  try {
    const workspace = await getWorkspace(req.auth.userId, req.params.workspaceId);
    res.json({ workspace });
  } catch (error) {
    handleError(res, error);
  }
});

router.put('/:workspaceId', requireWorkspacePermission('workspace:update'), async (req, res) => {
  try {
    const workspace = await updateWorkspace(req.auth.userId, req.params.workspaceId, req.body || {});
    res.json({ workspace });
  } catch (error) {
    handleError(res, error);
  }
});

router.delete('/:workspaceId', requireWorkspacePermission('workspace:archive'), async (req, res) => {
  try {
    const workspace = await archiveWorkspace(req.auth.userId, req.params.workspaceId);
    res.json({ ok: true, workspace });
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:workspaceId/test', requireWorkspacePermission('workspace:test'), async (req, res) => {
  try {
    const result = await testWorkspaceSheetConnection(req.workspace);
    res.json({ ok: result.ok, result });
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:workspaceId/members', requireWorkspacePermission('members:read'), async (req, res) => {
  try {
    const rows = await getWorkspaceMembers(req.params.workspaceId);
    res.json({ rows });
  } catch (error) {
    handleError(res, error);
  }
});

export default router;
