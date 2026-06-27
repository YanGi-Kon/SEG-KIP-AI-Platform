import express from 'express';
import { requireAccessToken } from '../middleware/auth.js';
import { requireWorkspaceMode } from '../middleware/featureGate.js';
import { requireWorkspacePermission } from '../middleware/workspaceAccess.js';
import { readSheetRows, listSheets, validateServiceAccount } from '../services/googleSheetsService.js';
import { getDailyReports, writeActDocument } from '../services/actBlankSheetService.js';
import { resolveWorkspaceGoogleConfig } from '../services/workspaceGoogleService.js';

const router = express.Router();

function isTargetWork(value) {
  const v = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  return ['то-2','то2','to-2','to2','акт','akt'].includes(v);
}

function isDataRow(row) {
  const joined = row.map(v => String(v || '').toLowerCase()).join(' ');
  if (!row.some(v => String(v || '').trim())) return false;
  if (joined.includes('наименование') || joined.includes('заводской') || joined.includes('перечень')) return false;
  return Boolean(row[1] || row[2] || row[8]);
}

function makeSourceKey({ sheetName, rowNumber, positionNo, serialNo, deviceName, measureRange, place }) {
  const serialOrFallback = String(serialNo || `${positionNo || ''}-${deviceName || ''}-${measureRange || ''}-${place || ''}`).trim();
  return [sheetName, rowNumber, positionNo || '', serialOrFallback].map(v => String(v || '').trim()).join('::');
}

function mapRow(row, index, sheetName, completedByKey = new Map()) {
  const mapped = {
    rowNumber: index + 1,
    date: row[0] || '',
    positionNo: row[1] || '',
    deviceName: row[2] || '',
    typeMark: row[3] || '',
    serialNo: row[4] || '',
    measureRange: row[5] || '',
    place: row[6] || '',
    suv: row[7] || '',
    workType: row[8] || '',
    executor: row[9] || '',
    sourceSheet: sheetName,
    sourceRowNumber: index + 1
  };
  mapped.sourceKey = makeSourceKey(mapped);
  const completed = completedByKey.get(mapped.sourceKey);
  mapped.isCompleted = Boolean(completed);
  mapped.actNo = completed?.actNo || '';
  mapped.rowStart = completed?.rowStart || '';
  mapped.status = mapped.isCompleted ? 'Хужат якунланди' : 'Хужат яратиш';
  return mapped;
}

function getPayload(req) {
  return { ...req.query, ...req.body };
}

async function buildMonthlyAnalysis({ spreadsheetUrl, sheetName, serviceAccount }) {
  const rows = await readSheetRows({ spreadsheetUrl, serviceAccount, sheetName, range: 'A:J' });
  const reports = await getDailyReports({ spreadsheetUrl, serviceAccount });
  const completedByKey = new Map(
    reports
      .filter(r => String(r.sourceKey || '').trim())
      .map(r => [String(r.sourceKey).trim(), r])
  );
  const dataRows = rows.map((row, index) => ({ row, index })).filter(x => isDataRow(x.row));
  const matched = dataRows.filter(x => isTargetWork(x.row[8])).map(x => mapRow(x.row, x.index, sheetName, completedByKey));
  const createdDocuments = matched.filter(row => row.isCompleted).length || reports.length;
  const completionPercentage = matched.length ? Math.min(100, Math.round((createdDocuments / matched.length) * 100)) : 0;
  return {
    totalRows: dataRows.length,
    plannedDocuments: matched.length,
    createdDocuments,
    completionPercentage,
    sheetName,
    rows: matched
  };
}

router.post('/settings/test', async (req, res) => {
  try {
    const { spreadsheetUrl, serviceAccount } = req.body || {};
    validateServiceAccount(serviceAccount);
    const sheets = await listSheets({ spreadsheetUrl, serviceAccount });
    res.json({ ok: true, sheets });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/workspaces/:workspaceId/monthly-analysis', requireWorkspaceMode, requireAccessToken, requireWorkspacePermission('workspace:read'), async (req, res) => {
  try {
    const workspace = req.workspace;
    if (!workspace?.spreadsheetUrl || !workspace?.mainSheetName) {
      return res.status(400).json({
        error: 'Workspace Google Sheets configuration is incomplete',
        code: 'WORKSPACE_SHEET_CONFIG_INCOMPLETE',
      });
    }
    const config = resolveWorkspaceGoogleConfig(workspace);
    const data = await buildMonthlyAnalysis({
      spreadsheetUrl: config.spreadsheetUrl,
      serviceAccount: config.serviceAccount,
      sheetName: workspace.mainSheetName,
    });
    res.json({
      ...data,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceStatus: workspace.status,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/monthly-analysis', async (req, res) => {
  try {
    const { spreadsheetUrl, sheetName, serviceAccount } = getPayload(req);
    const data = await buildMonthlyAnalysis({ spreadsheetUrl, serviceAccount, sheetName });
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/monthly-analysis', async (req, res) => {
  res.status(405).json({ error: 'Ушбу endpoint учун POST ишлатинг: serviceAccount JSON body орқали юборилади.' });
});

router.post('/create', async (req, res) => {
  try {
    const { spreadsheetUrl, serviceAccount, act } = req.body || {};
    const result = await writeActDocument({ spreadsheetUrl, serviceAccount, act });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/reports/daily', async (req, res) => {
  try {
    const { spreadsheetUrl, serviceAccount } = req.body || {};
    const rows = await getDailyReports({ spreadsheetUrl, serviceAccount });
    res.json({ rows });
  } catch (err) {
    res.status(400).json({ error: err.message, rows: [] });
  }
});

export default router;
