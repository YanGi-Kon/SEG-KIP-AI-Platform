import express from 'express';
import multer from 'multer';
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
import {
  createSignerForWorkspace,
  deleteSignerForWorkspace,
  getWorkspaceSignerList,
  updateSignerForWorkspace,
} from '../services/workspaceSignerService.js';
import { testWorkspaceSheetConnection } from '../services/workspaceGoogleService.js';
import { uploadSignaturePng } from '../services/signatureApprovalService.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

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

router.get('/:workspaceId/signers', requireWorkspacePermission('signers:read'), async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
    const rows = await getWorkspaceSignerList(req.params.workspaceId, { includeInactive });
    res.json({ rows });
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:workspaceId/signers/signature', requireWorkspacePermission('signers:create'), upload.single('signature'), async (req, res) => {
  try {
    const result = await uploadSignaturePng(
      { spreadsheetUrl: req.workspace.spreadsheetUrl },
      req.file,
      {
        actor: req.auth.user?.fullName || req.auth.user?.email || 'Workspace user',
        ip: req.ip,
        userAgent: req.get('user-agent') || '',
      },
    );
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:workspaceId/signers', requireWorkspacePermission('signers:create'), async (req, res) => {
  try {
    const signer = await createSignerForWorkspace(req.params.workspaceId, req.body || {}, req.auth.userId);
    res.status(201).json({ ok: true, signer });
  } catch (error) {
    handleError(res, error);
  }
});

router.put('/:workspaceId/signers/:signerId', requireWorkspacePermission('signers:update'), async (req, res) => {
  try {
    const signer = await updateSignerForWorkspace(req.params.workspaceId, req.params.signerId, req.body || {}, req.auth.userId);
    res.json({ ok: true, signer });
  } catch (error) {
    handleError(res, error);
  }
});

router.delete('/:workspaceId/signers/:signerId', requireWorkspacePermission('signers:delete'), async (req, res) => {
  try {
    const result = await deleteSignerForWorkspace(req.params.workspaceId, req.params.signerId, req.auth.userId);
    res.json({ ok: true, ...result });
  } catch (error) {
    handleError(res, error);
  }
});

export default router;
