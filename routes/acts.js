import express from 'express';
import { readSheetRows, listSheets, validateServiceAccount } from '../services/googleSheetsService.js';
import { getDailyReports, writeActDocument } from '../services/actBlankSheetService.js';
import { requireWorkspaceRequestPermission } from '../middleware/workspaceAccess.js';
import { requireAccessToken } from '../middleware/auth.js';

const router = express.Router();

function workspaceGuards(permission) {
  const authorizeWorkspace = requireWorkspaceRequestPermission(permission);
  return (req, res, next) => requireAccessToken(req, res, () => authorizeWorkspace(req, res, next));
}

router.use(workspaceGuards('workspace:read'));

function clean(value) {
  return String(value ?? '').trim();
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function parseServerServiceAccount() {
  const raw = clean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_BASE64);
  if (!raw) return null;
  const direct = safeJsonParse(raw);
  if (direct) return direct;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch (_) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON / BASE64 парсинг хатоси');
  }
}

function resolveActsConfig(req) {
  const input = req.body || {};
  const workspace = req.workspace || {};
  const spreadsheetUrl = clean(workspace.spreadsheetUrl || input.spreadsheetUrl || input.spreadsheetId);
  if (!spreadsheetUrl) throw new Error('Google Sheets ҳаволаси киритилмаган');
  return {
    spreadsheetUrl,
    serviceAccount: validateServiceAccount(workspace.serviceAccountBase64 ? safeJsonParse(Buffer.from(workspace.serviceAccountBase64, 'base64').toString('utf8')) : input.serviceAccount || parseServerServiceAccount()),
  };
}

function isTargetWork(value) {
  const v = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  return ['то-2','то2','to-2','to2','акт','akt'].includes(v);
}

// Find the header row and map column names to their indices
function buildColumnMap(rows) {
  const HEADER_KEYWORDS = ['наименование', 'заводской', 'перечень', 'предел'];
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const joined = rows[i].map(v => String(v || '').toLowerCase()).join(' ');
    if (HEADER_KEYWORDS.filter(k => joined.includes(k)).length >= 2) {
      // This is the header row
      const map = {};
      rows[i].forEach((cell, idx) => {
        const key = String(cell || '').trim().toLowerCase().replace(/\s+/g, '');
        map[key] = idx;
      });
      return { headerRowIndex: i, map };
    }
  }
  // fallback: assume standard layout (База style)
  return { headerRowIndex: -1, map: {} };
}

// Resolve column index with fallback
function colIdx(map, keys, fallback) {
  for (const key of keys) {
    if (map[key] !== undefined) return map[key];
  }
  return fallback;
}

function isDataRow(row, headerRowIndex, colMap) {
  if (!row.some(v => String(v || '').trim())) return false;
  const joined = row.map(v => String(v || '').toLowerCase()).join(' ');
  if (joined.includes('наименование') || joined.includes('заводской') || joined.includes('перечень')) return false;
  const posIdx = colIdx(colMap, ['позномер', 'поз', 'pos'], 1);
  const devIdx = colIdx(colMap, ['наименованиеси', 'наименование'], 2);
  const workIdx = colIdx(colMap, ['переченьв/р', 'переченьвр', 'перечень', 'worktype'], 8);
  return Boolean(row[posIdx] || row[devIdx] || row[workIdx]);
}

function makeSourceKey({ sheetName, rowNumber, positionNo, serialNo, deviceName, measureRange, place }) {
  const serialOrFallback = String(serialNo || `${positionNo || ''}-${deviceName || ''}-${measureRange || ''}-${place || ''}`).trim();
  return [sheetName, rowNumber, positionNo || '', serialOrFallback].map(v => String(v || '').trim()).join('::');
}

function mapRow(row, index, sheetName, completedByKey = new Map(), colMap = {}) {
  const posIdx  = colIdx(colMap, ['позномер','поз','pos'], 1);
  const devIdx  = colIdx(colMap, ['наименованиеси','наименование'], 2);
  const typIdx  = colIdx(colMap, ['тип,марка','типмарка','тип'], 3);
  const serIdx  = colIdx(colMap, ['заводскойномер','заводской','serial'], 4);
  const rngIdx  = colIdx(colMap, ['пределизмерения','предел','range'], 5);
  const plcIdx  = colIdx(colMap, ['местоустановки','место','place'], 6);
  const skvIdx  = colIdx(colMap, ['скв','скважина','skv'], 7);
  const wrkIdx  = colIdx(colMap, ['переченьв/р','переченьвр','перечень','worktype'], 8);
  const excIdx  = colIdx(colMap, ['исполнительработ','исполнитель','executor'], 9);
  const mapped = {
    rowNumber: index + 1,
    date: row[0] || '',
    positionNo: row[posIdx] || '',
    deviceName: row[devIdx] || '',
    typeMark: row[typIdx] || '',
    serialNo: row[serIdx] || '',
    measureRange: row[rngIdx] || '',
    place: row[plcIdx] || '',
    suv: row[skvIdx] || '',
    workType: row[wrkIdx] || '',
    executor: row[excIdx] || '',
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
  const rows = await readSheetRows({ spreadsheetUrl, serviceAccount, sheetName, range: 'A:K' });
  const reports = await getDailyReports({ spreadsheetUrl, serviceAccount });
  const completedByKey = new Map(
    reports
      .filter(r => String(r.sourceKey || '').trim())
      .map(r => [String(r.sourceKey).trim(), r])
  );
  
  // Auto-detect column positions from the header row
  const { headerRowIndex, map: colMap } = buildColumnMap(rows);
  const wrkIdx = colIdx(colMap, ['переченьв/р','переченьвр','перечень','worktype'], 8);
  
  const dataRows = rows
    .map((row, index) => ({ row, index }))
    .filter(x => x.index > headerRowIndex) // skip header rows
    .filter(x => isDataRow(x.row, headerRowIndex, colMap));
  
  const matched = dataRows
    .filter(x => isTargetWork(x.row[wrkIdx]))
    .map(x => mapRow(x.row, x.index, sheetName, completedByKey, colMap));
  
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
    const config = resolveActsConfig(req);
    const sheets = await listSheets(config);
    res.json({ ok: true, sheets });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/monthly-analysis', async (req, res) => {
  try {
    const { sheetName } = getPayload(req);
    const config = resolveActsConfig(req);
    const data = await buildMonthlyAnalysis({ ...config, sheetName });
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/monthly-analysis', async (req, res) => {
  res.status(405).json({ error: 'Ушбу endpoint учун POST ишлатинг.' });
});

router.post('/create', async (req, res) => {
  try {
    const { act } = req.body || {};
    const config = resolveActsConfig(req);
    const result = await writeActDocument({ ...config, act });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/reports/daily', async (req, res) => {
  try {
    const config = resolveActsConfig(req);
    const rows = await getDailyReports(config);
    res.json({ rows });
  } catch (err) {
    res.status(400).json({ error: err.message, rows: [] });
  }
});

export default router;
