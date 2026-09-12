import express from 'express';
import {
  extractSpreadsheetId,
  getSheetsClient,
  readSheetRows,
  listSheets,
  validateServiceAccount,
} from '../services/googleSheetsService.js';
import { deleteActDocument, getDailyReports, writeActDocument } from '../services/actBlankSheetService.js';
import { requireWorkspaceRequestPermission } from '../middleware/workspaceAccess.js';
import { requireAccessToken } from '../middleware/auth.js';

const router = express.Router();
const RU_MONTHS = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const RU_MONTH_NUMBERS = new Map([
  ['январь', 1], ['января', 1], ['февраль', 2], ['февраля', 2], ['март', 3], ['марта', 3],
  ['апрель', 4], ['апреля', 4], ['май', 5], ['мая', 5], ['июнь', 6], ['июня', 6],
  ['июль', 7], ['июля', 7], ['август', 8], ['августа', 8], ['сентябрь', 9], ['сентября', 9],
  ['октябрь', 10], ['октября', 10], ['ноябрь', 11], ['ноября', 11], ['декабрь', 12], ['декабря', 12],
]);

function workspaceGuards(permission) {
  const authorizeWorkspace = requireWorkspaceRequestPermission(permission);
  return (req, res, next) => requireAccessToken(req, res, () => authorizeWorkspace(req, res, next));
}

router.use(workspaceGuards('workspace:read'));
const requireActsDelete = requireWorkspaceRequestPermission('documents:cancel');

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

export function isTargetWork(value) {
  const v = String(value || '').trim();
  return v === 'AKT' || v === 'АКТ';
}

function validDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function parseAnalysisDate(value) {
  const raw = clean(value);
  if (!raw) return null;

  let match = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\D|$)/);
  if (match) return validDateParts(Number(match[3]), Number(match[2]), Number(match[1]));

  match = raw.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})(?:\D|$)/);
  if (match) return validDateParts(Number(match[1]), Number(match[2]), Number(match[3]));

  match = raw.toLowerCase().replace(/ё/g, 'е').match(/^(\d{1,2})\s+([а-я]+)\s+(\d{4})(?:\D|$)/u);
  if (match) {
    const month = RU_MONTH_NUMBERS.get(match[2]);
    if (month) return validDateParts(Number(match[3]), month, Number(match[1]));
  }

  if (/^\d+$/.test(raw)) return null;
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  const parsed = new Date(timestamp);
  const year = parsed.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return validDateParts(year, parsed.getUTCMonth() + 1, parsed.getUTCDate());
}

export function isAnalysisDateInPeriod(value, year, month) {
  const parsed = parseAnalysisDate(value);
  return Boolean(parsed && parsed.year === Number(year) && parsed.month === Number(month));
}

function normalizeAnalysisPeriod(yearRaw, monthRaw) {
  const now = new Date();
  const year = Number(yearRaw ?? now.getFullYear());
  const month = Number(monthRaw ?? (now.getMonth() + 1));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Ойлик анализ йили нотўғри');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Ойлик анализ ойи нотўғри');
  return { year, month, monthName: RU_MONTHS[month] };
}

function normalizeMonthNumber(value) {
  const raw = clean(value);
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return numeric;
  return RU_MONTH_NUMBERS.get(raw.toLowerCase().replace(/ё/g, 'е')) || null;
}

function buildColumnMap(rows) {
  const HEADER_KEYWORDS = ['наименование', 'заводской', 'перечень', 'предел'];
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const joined = rows[i].map(v => String(v || '').toLowerCase()).join(' ');
    if (HEADER_KEYWORDS.filter(k => joined.includes(k)).length >= 2) {
      const map = {};
      rows[i].forEach((cell, idx) => {
        const key = String(cell || '').trim().toLowerCase().replace(/\s+/g, '');
        map[key] = idx;
      });
      return { headerRowIndex: i, map };
    }
  }
  return { headerRowIndex: -1, map: {} };
}

function colIdx(map, keys, fallback) {
  for (const key of keys) {
    if (map[key] !== undefined) return map[key];
  }
  return fallback;
}

function findColIdx(map, keys) {
  for (const key of keys) {
    if (map[key] !== undefined) return map[key];
  }
  return -1;
}

export function isAnalysisRowInPeriod(row, colMap, year, month) {
  const helperYearIdx = findColIdx(colMap, ['__год']);
  const helperMonthIdx = findColIdx(colMap, ['__месяц']);
  if (helperYearIdx >= 0 && helperMonthIdx >= 0) {
    return Number(clean(row[helperYearIdx])) === Number(year)
      && normalizeMonthNumber(row[helperMonthIdx]) === Number(month);
  }
  return isAnalysisDateInPeriod(row[0], year, month);
}

function hasAnalysisPeriodHelpers(colMap) {
  return findColIdx(colMap, ['__год']) >= 0 && findColIdx(colMap, ['__месяц']) >= 0;
}

function sheetA1Title(sheetName) {
  return `'${String(sheetName || '').replace(/'/g, "''")}'`;
}

async function refreshAnalysisPeriodFilter({ sheets, spreadsheetId, sheetName }) {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title,gridProperties(rowCount)))',
  });
  const target = (metadata.data.sheets || []).find(
    (sheet) => clean(sheet?.properties?.title) === clean(sheetName),
  );
  const sheetId = target?.properties?.sheetId;
  const rowCount = Number(target?.properties?.gridProperties?.rowCount || 0);
  if (!Number.isInteger(sheetId) || rowCount < 5) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: 4,
              endIndex: rowCount,
            },
            properties: { hiddenByUser: false },
            fields: 'hiddenByUser',
          },
        },
        { clearBasicFilter: { sheetId } },
        {
          setBasicFilter: {
            filter: {
              range: {
                sheetId,
                startRowIndex: 3,
                endRowIndex: rowCount,
                startColumnIndex: 0,
                endColumnIndex: 13,
              },
              criteria: {
                11: {
                  condition: {
                    type: 'CUSTOM_FORMULA',
                    values: [{ userEnteredValue: '=И($L5=TO_TEXT($O$1);$M5=$Q$1)' }],
                  },
                },
              },
            },
          },
        },
      ],
    },
  });
  return true;
}

async function syncAnalysisPeriodSelector({ spreadsheetUrl, serviceAccount, sheetName, year, monthName }) {
  try {
    const selectorRows = await readSheetRows({ spreadsheetUrl, serviceAccount, sheetName, range: 'N1:Q1' });
    const selector = selectorRows?.[0] || [];
    if (clean(selector[0]).toUpperCase() !== 'ГОД' || clean(selector[2]).toUpperCase() !== 'МЕСЯЦ') {
      return { synced: false, reason: 'selector_layout_not_found' };
    }

    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    const sheets = await getSheetsClient(serviceAccount);
    const sheetRef = sheetA1Title(sheetName);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `${sheetRef}!O1`, values: [[Number(year)]] },
          { range: `${sheetRef}!Q1`, values: [[monthName]] },
        ],
      },
    });
    await refreshAnalysisPeriodFilter({ sheets, spreadsheetId, sheetName });
    return { synced: true, yearCell: `${sheetName}!O1`, monthCell: `${sheetName}!Q1` };
  } catch (err) {
    return { synced: false, reason: 'selector_sync_failed', error: clean(err?.message) };
  }
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

async function buildMonthlyAnalysis({ spreadsheetUrl, sheetName, serviceAccount, year: yearRaw, month: monthRaw }) {
  const { year, month, monthName } = normalizeAnalysisPeriod(yearRaw, monthRaw);
  const selectorSync = await syncAnalysisPeriodSelector({ spreadsheetUrl, serviceAccount, sheetName, year, monthName });
  const rows = await readSheetRows({ spreadsheetUrl, serviceAccount, sheetName, range: 'A:M' });
  const reports = await getDailyReports({ spreadsheetUrl, serviceAccount });
  const completedByKey = new Map(
    reports
      .filter(r => String(r.sourceKey || '').trim())
      .map(r => [String(r.sourceKey).trim(), r])
  );

  const { headerRowIndex, map: colMap } = buildColumnMap(rows);
  const wrkIdx = colIdx(colMap, ['переченьв/р','переченьвр','перечень','worktype'], 8);

  const dataRows = rows
    .map((row, index) => ({ row, index }))
    .filter(x => x.index > headerRowIndex)
    .filter(x => isDataRow(x.row, headerRowIndex, colMap));

  const periodRows = dataRows.filter(x => isAnalysisRowInPeriod(x.row, colMap, year, month));

  const matched = periodRows
    .filter(x => isTargetWork(x.row[wrkIdx]))
    .map(x => mapRow(x.row, x.index, sheetName, completedByKey, colMap));

  const createdDocuments = matched.filter(row => row.isCompleted).length;
  const completionPercentage = matched.length ? Math.min(100, Math.round((createdDocuments / matched.length) * 100)) : 0;
  return {
    totalRows: periodRows.length,
    plannedDocuments: matched.length,
    createdDocuments,
    completionPercentage,
    sheetName,
    periodYear: year,
    periodMonth: month,
    periodMonthName: monthName,
    periodSource: hasAnalysisPeriodHelpers(colMap) ? 'helpers' : 'date',
    selectorSynced: selectorSync.synced,
    selectorSyncReason: selectorSync.reason || '',
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
    const { sheetName, year, month } = getPayload(req);
    const config = resolveActsConfig(req);
    const data = await buildMonthlyAnalysis({ ...config, sheetName, year, month });
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

router.delete('/reports/daily/:actNo', requireActsDelete, async (req, res) => {
  try {
    const config = resolveActsConfig(req);
    const result = await deleteActDocument({ ...config, actNo: req.params.actNo });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.statusCode || 400).json({ ok: false, error: err.message });
  }
});

export default router;
