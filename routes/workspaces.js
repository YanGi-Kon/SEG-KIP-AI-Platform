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
import {
  getWorkspaceSignaturePng,
  testWorkspaceSignatureFolder,
  uploadWorkspaceSignaturePng,
} from '../services/workspaceSignatureService.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

function handleError(res, error) {
  const knownStatus = Number(error.statusCode);
  let status = Number.isInteger(knownStatus) && knownStatus >= 400 && knownStatus < 600 ? knownStatus : 500;
  if (error?.code === '23505') status = 409;
  if (error?.code === '23503' || error?.code === '42P01' || error?.code === '42703') status = 400;
  const message = String(error?.message || '').trim() || 'Workspace request failed';
  res.status(status).json({
    error: message,
    code: error.code || (status >= 500 ? 'WORKSPACE_SERVICE_ERROR' : 'WORKSPACE_REQUEST_FAILED'),
    driveErrorCode: error.driveErrorCode || undefined,
    driveErrorMessage: error.driveErrorMessage || undefined,
    rawReason: error.rawReason || undefined,
    serviceAccountEmail: error.serviceAccountEmail || undefined,
    serviceAccountProjectId: error.serviceAccountProjectId || undefined,
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

router.put('/:workspaceId/signers/signature-folder', requireWorkspacePermission('signers:update'), async (req, res) => {
  try {
    const driveFolderUrl = req.body?.driveFolderUrl ?? req.body?.driveFolderId ?? '';
    const workspace = await updateWorkspace(req.auth.userId, req.params.workspaceId, {
      driveFolderUrl,
      status: req.workspace.status,
    });
    res.json({ ok: true, workspace, driveFolderId: workspace.driveFolderId || '' });
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:workspaceId/signers/signature-folder/test', requireWorkspacePermission('signers:update'), async (req, res) => {
  try {
    const result = await testWorkspaceSignatureFolder(req.workspace, { writeTest: true });
    res.json({ ok: true, result });
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:workspaceId/signers/signature/:signatureId', requireWorkspacePermission('signers:read'), async (req, res) => {
  try {
    const image = await getWorkspaceSignaturePng(req.params.workspaceId, req.params.signatureId);
    res.setHeader('Content-Type', image.mimeType || 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(image.fileName || 'signature.png')}"`);
    res.end(image.buffer);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:workspaceId/signers/signature', requireWorkspacePermission('signers:create'), upload.single('signature'), async (req, res) => {
  try {
    const result = await uploadWorkspaceSignaturePng(req.workspace, req.file, {
      actorUserId: req.auth.userId,
      position: req.body?.position || '',
      fullName: req.body?.fullName || req.body?.fio || '',
    });
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
