import express from 'express';
import {
  extractSpreadsheetId,
  getSheetsClient,
  listSheets,
  readSheetRows,
  validateServiceAccount,
} from '../services/googleSheetsService.js';
import { requireAccessToken } from '../middleware/auth.js';
import { requireWorkspaceRequestPermission } from '../middleware/workspaceAccess.js';

const router = express.Router();

const RU_MONTHS = [
  '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const RU_MONTH_NUMBERS = new Map([
  ['январь', 1], ['января', 1], ['февраль', 2], ['февраля', 2],
  ['март', 3], ['марта', 3], ['апрель', 4], ['апреля', 4],
  ['май', 5], ['мая', 5], ['июнь', 6], ['июня', 6],
  ['июль', 7], ['июля', 7], ['август', 8], ['августа', 8],
  ['сентябрь', 9], ['сентября', 9], ['октябрь', 10], ['октября', 10],
  ['ноябрь', 11], ['ноября', 11], ['декабрь', 12], ['декабря', 12],
]);
const BASE_SHEET_CANDIDATES = ['База', 'ОБШИЕ', 'Общие', 'OBSHIE', 'Baza'];
export const HISOBOT_PERIOD_MIN_YEAR = 2026;
export const HISOBOT_PERIOD_MAX_YEAR = 2028;
const FIELDS = [
  ['date', ['дата']],
  ['pos', ['позномер', 'поз', 'позиция']],
  ['name', ['наименованиеси', 'наименование']],
  ['brand', ['типмарка', 'тип']],
  ['serial', ['заводскойномер', 'заводской']],
  ['range', ['пределизмерения', 'предел']],
  ['location', ['местоустановки', 'место']],
  ['skv', ['скв', 'скважина']],
  ['work', ['переченьвр', 'перечень']],
  ['executor', ['исполнительработдолжностьфио', 'исполнительработ', 'исполнитель']],
  ['signature', ['подпись', 'имзо']],
];

function clean(value) {
  return String(value ?? '').trim();
}

function norm(value) {
  return clean(value).replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/ё/g, 'е').toLowerCase();
}

function hardNorm(value) {
  return norm(value).replace(/[\s\-_.,:;()"'`«»№#\/]+/g, '');
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
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON / BASE64 parsing xatosi');
  }
}

function workspaceServiceAccount(workspace = {}) {
  if (workspace.serviceAccountBase64) {
    const decoded = safeJsonParse(
      Buffer.from(workspace.serviceAccountBase64, 'base64').toString('utf8'),
    );
    if (decoded) return validateServiceAccount(decoded);
  }
  return validateServiceAccount(parseServerServiceAccount());
}

function quoteSheetName(sheetName) {
  return `'${String(sheetName).replace(/'/g, "''")}'`;
}

async function refreshPeriodFilter({ sheets, spreadsheetId, sheetName }) {
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

function resolveBaseSheetName(sheetNames = []) {
  for (const candidate of BASE_SHEET_CANDIDATES) {
    const exact = sheetNames.find((name) => clean(name) === candidate);
    if (exact) return exact;
  }
  for (const candidate of BASE_SHEET_CANDIDATES) {
    const wanted = hardNorm(candidate);
    const normalized = sheetNames.find((name) => hardNorm(name) === wanted);
    if (normalized) return normalized;
  }
  const error = new Error('База varog‘i topilmadi');
  error.code = 'HISOBOT_BASE_SHEET_NOT_FOUND';
  throw error;
}

function normalizeMonthNumber(value) {
  const raw = clean(value);
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return numeric;
  return RU_MONTH_NUMBERS.get(norm(raw)) || null;
}

function normalizeSelection(yearRaw, monthRaw) {
  const year = Number(yearRaw);
  const month = normalizeMonthNumber(monthRaw);
  if (!Number.isInteger(year) || year < HISOBOT_PERIOD_MIN_YEAR || year > HISOBOT_PERIOD_MAX_YEAR) {
    const error = new Error(`Hisobot davri yili faqat ${HISOBOT_PERIOD_MIN_YEAR}–${HISOBOT_PERIOD_MAX_YEAR} oralig‘ida bo‘lishi kerak`);
    error.code = 'HISOBOT_PERIOD_YEAR_INVALID';
    throw error;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    const error = new Error('Hisobot davri oyi noto‘g‘ri');
    error.code = 'HISOBOT_PERIOD_MONTH_INVALID';
    throw error;
  }
  return { year, month, monthName: RU_MONTHS[month] };
}

function findHeaderRow(rows = []) {
  let best = { index: -1, score: -1 };
  for (let i = 0; i < Math.min(rows.length, 12); i += 1) {
    const normalized = (rows[i] || []).map(hardNorm);
    let score = 0;
    if (normalized.some((v) => v === 'наименованиеси' || v === 'наименование')) score += 3;
    if (normalized.some((v) => v === 'заводскойномер' || v === 'заводской')) score += 3;
    if (normalized.some((v) => v === 'местоустановки' || v === 'место')) score += 2;
    if (normalized.some((v) => v === 'переченьвр' || v === 'перечень')) score += 2;
    if (score > best.score) best = { index: i, score };
  }
  if (best.index < 0 || best.score < 5) {
    const error = new Error('База varog‘ida jurnal sarlavhalari topilmadi');
    error.code = 'HISOBOT_BASE_HEADER_NOT_FOUND';
    throw error;
  }
  return best.index;
}

function findColumn(headers, aliases = []) {
  const normalized = headers.map(hardNorm);
  for (const alias of aliases) {
    const wanted = hardNorm(alias);
    const exact = normalized.indexOf(wanted);
    if (exact >= 0) return exact;
  }
  for (const alias of aliases) {
    const wanted = hardNorm(alias);
    const partial = normalized.findIndex((value) => value && wanted && (value.includes(wanted) || wanted.includes(value)));
    if (partial >= 0) return partial;
  }
  return -1;
}

function parseDatePeriod(value) {
  const raw = clean(value);
  if (!raw) return null;
  let match = raw.match(/^(\d{1,2})[.\/-](\d{4})(?:\D|$)/);
  if (match) return { month: Number(match[1]), year: Number(match[2]) };
  match = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\D|$)/);
  if (match) return { month: Number(match[2]), year: Number(match[3]) };
  match = norm(raw).match(/(?:^|\s)([а-я]+)\s+(\d{4})(?:\D|$)/u);
  if (match) {
    const month = normalizeMonthNumber(match[1]);
    if (month) return { month, year: Number(match[2]) };
  }
  return null;
}

function isDataRow(row = [], indexes = {}) {
  return Boolean(
    clean(row[indexes.pos])
    || clean(row[indexes.name])
    || clean(row[indexes.serial])
    || clean(row[indexes.location])
    || clean(row[indexes.work]),
  );
}

export function parseHisobotPeriodRows(rows = [], yearRaw, monthRaw) {
  const { year, month, monthName } = normalizeSelection(yearRaw, monthRaw);
  const headerIndex = findHeaderRow(rows);
  const headers = rows[headerIndex] || [];
  const indexes = {};
  for (const [field, aliases] of FIELDS) indexes[field] = findColumn(headers, aliases);
  const helperYearIndex = findColumn(headers, ['__Год']);
  const helperMonthIndex = findColumn(headers, ['__Месяц']);
  const hasHelpers = helperYearIndex >= 0 && helperMonthIndex >= 0;

  const mapped = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    if (!isDataRow(row, indexes)) continue;

    // Visible Дата is the primary period source whenever it contains a parseable value.
    // __Год / __Месяц exist mainly to carry the month/year for continuation rows where Дата is blank.
    // Treating helper columns as globally authoritative breaks older months when helper cells are blank
    // or were populated only for newer data (e.g. August while January still has a real Дата value).
    const parsedDate = parseDatePeriod(indexes.date >= 0 ? row[indexes.date] : row[0]);
    const helperYear = hasHelpers ? Number(clean(row[helperYearIndex])) : NaN;
    const helperMonth = hasHelpers ? normalizeMonthNumber(row[helperMonthIndex]) : null;
    const helperValid = Number.isInteger(helperYear) && helperYear >= 2000 && helperYear <= 2100
      && Number.isInteger(helperMonth) && helperMonth >= 1 && helperMonth <= 12;

    const rowPeriod = parsedDate || (helperValid ? { year: helperYear, month: helperMonth } : null);
    const rowMatches = Boolean(rowPeriod && rowPeriod.year === year && rowPeriod.month === month);
    if (!rowMatches) continue;

    const item = {
      _rowNumber: index + 1,
      _periodBaseRowNumber: index + 1,
      _periodYear: year,
      _periodMonth: month,
    };
    for (const [field] of FIELDS) {
      item[field] = indexes[field] >= 0 ? (row[indexes[field]] ?? '') : '';
    }
    mapped.push(item);
  }

  return {
    rows: mapped,
    year,
    month,
    monthName,
    periodSource: hasHelpers ? 'date+helpers-fallback' : 'date',
    headerRow: headerIndex + 1,
  };
}

async function readSelector({ sheets, spreadsheetId, baseSheet }) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteSheetName(baseSheet)}!N1:Q1`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const selector = response.data.values?.[0] || [];
  if (clean(selector[0]).toUpperCase() !== 'ГОД' || clean(selector[2]).toUpperCase() !== 'МЕСЯЦ') {
    const error = new Error('База!N1:Q1 davr selektori topilmadi');
    error.code = 'HISOBOT_PERIOD_SELECTOR_NOT_FOUND';
    throw error;
  }
  return { year: selector[1], month: selector[3] };
}

async function writeSelector({ sheets, spreadsheetId, baseSheet, year, monthName }) {
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: `${quoteSheetName(baseSheet)}!O1`, values: [[Number(year)]] },
        { range: `${quoteSheetName(baseSheet)}!Q1`, values: [[monthName]] },
      ],
    },
  });
  await refreshPeriodFilter({ sheets, spreadsheetId, sheetName: baseSheet });
}

const requireWorkspaceRead = requireWorkspaceRequestPermission('workspace:read');
router.use((req, res, next) => requireAccessToken(req, res, () => requireWorkspaceRead(req, res, next)));

router.post('/select', async (req, res) => {
  try {
    const workspace = req.workspace || {};
    const spreadsheetUrl = clean(workspace.spreadsheetUrl);
    if (!spreadsheetUrl) {
      const error = new Error('Google Sheets havolasi kiritilmagan');
      error.code = 'SHEET_URL_REQUIRED';
      throw error;
    }

    const serviceAccount = workspaceServiceAccount(workspace);
    const sheetNames = await listSheets({ spreadsheetUrl, serviceAccount });
    const baseSheet = resolveBaseSheetName(sheetNames);
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    const sheets = await getSheetsClient(serviceAccount);
    const currentSelector = await readSelector({ sheets, spreadsheetId, baseSheet });

    const requestedYear = req.body?.year ?? currentSelector.year;
    const requestedMonth = req.body?.month ?? currentSelector.month;
    const selection = normalizeSelection(requestedYear, requestedMonth);

    if (req.body?.year !== undefined || req.body?.month !== undefined) {
      await writeSelector({
        sheets,
        spreadsheetId,
        baseSheet,
        year: selection.year,
        monthName: selection.monthName,
      });
    }

    const rows = await readSheetRows({
      spreadsheetUrl,
      serviceAccount,
      sheetName: baseSheet,
      range: 'A:M',
    });
    const parsed = parseHisobotPeriodRows(rows, selection.year, selection.month);

    return res.json({
      ok: true,
      sourceSpreadsheetId: spreadsheetId,
      baseSheet,
      selector: {
        year: parsed.year,
        month: parsed.month,
        monthName: parsed.monthName,
        yearCell: `${baseSheet}!O1`,
        monthCell: `${baseSheet}!Q1`,
      },
      periodSource: parsed.periodSource,
      headerRow: parsed.headerRow,
      totalRows: parsed.rows.length,
      rows: parsed.rows,
    });
  } catch (error) {
    return res.status(Number(error?.statusCode) || 400).json({
      ok: false,
      error: error?.message || 'HISOBOT JURNALI davrini tanlash xatosi',
      code: error?.code || 'HISOBOT_PERIOD_SELECT_FAILED',
    });
  }
});

export default router;
