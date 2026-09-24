import express from 'express';
import { requireAccessToken } from '../middleware/auth.js';
import { requireWorkspaceRequestPermission } from '../middleware/workspaceAccess.js';
import {
  deleteFaultReport,
  finalizeFaultReport,
  getFaultReport,
  listFaultReportFolders,
  normalizeFaultPeriod,
  saveFaultReport,
} from '../services/faultReportService.js';
import { classifyWorkspaceDriveError } from '../services/workspaceDriveFolderService.js';

const router = express.Router();
const requireWorkspaceRead = requireWorkspaceRequestPermission('workspace:read');
const requireFaultSave = requireWorkspaceRequestPermission('documents:create');
const requireFaultDelete = requireWorkspaceRequestPermission('documents:cancel');

router.use((req, res, next) => requireAccessToken(req, res, () => requireWorkspaceRead(req, res, next)));

router.get('/reports', async (req, res) => {
  try {
    const reports = await listFaultReportFolders(req.workspace.id);
    res.json({ ok: true, reports });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      code: error.code || 'FAULT_REPORT_LIST_FAILED',
      error: error.message,
    });
  }
});

router.get('/reports/:year/:month', async (req, res) => {
  try {
    const { year, month } = normalizeFaultPeriod(req.params.year, req.params.month);
    const report = await getFaultReport(req.workspace.id, year, month);
    if (!report) {
      return res.status(404).json({
        ok: false,
        code: 'FAULT_REPORT_NOT_FOUND',
        error: 'Nosozliklar jurnali hisoboti topilmadi.',
      });
    }
    return res.json({ ok: true, report });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      code: error.code || 'FAULT_REPORT_READ_FAILED',
      error: error.message,
    });
  }
});

router.post('/reports/:year/:month', requireFaultSave, async (req, res) => {
  try {
    const { year, month } = normalizeFaultPeriod(req.params.year, req.params.month);
    const report = await saveFaultReport({
      workspaceId: req.workspace.id,
      year,
      month,
      sourceSheetName: req.body?.sourceSheetName || req.workspace?.moduleSettings?.faults_sheet_name || req.workspace?.moduleSettings?.acts_sheet_name || '',
      rows: req.body?.rows,
      signer: req.body?.signer,
      createdBy: req.auth?.userId || null,
    });
    return res.json({ ok: true, report });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      code: error.code || 'FAULT_REPORT_SAVE_FAILED',
      error: error.message,
    });
  }
});

router.delete('/reports/:year/:month', requireFaultDelete, async (req, res) => {
  try {
    const report = await deleteFaultReport(req.workspace.id, req.params.year, req.params.month);
    return res.json({ ok: true, report });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      code: error.code || 'FAULT_REPORT_DELETE_FAILED',
      error: error.message,
    });
  }
});

router.post('/reports/:year/:month/finalize', requireFaultSave, async (req, res) => {
  try {
    const result = await finalizeFaultReport({
      workspace: req.workspace,
      year: req.params.year,
      month: req.params.month,
      completedBy: req.auth?.userId || null,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    const drive = classifyWorkspaceDriveError(error);
    const statusCode = Number(error.statusCode) || Number(drive.statusCode) || 500;
    return res.status(statusCode).json({
      ok: false,
      code: error.code || drive.code || 'FAULT_FINAL_PDF_FAILED',
      error: error.message || drive.message,
      recommendedFix: drive.recommendedFix || '',
    });
  }
});

export default router;
