import express from 'express';
import { listSheets, readSheetRows, validateServiceAccount } from '../services/googleSheetsService.js';
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
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON / BASE64 parsing xatosi');
  }
}

function requestedSheetTitle(req) {
  const input = req.body || req.query || {};
  // Sheet nomini ataylab trim qilmaymiz: Google Sheets varoq nomida
  // oxirgi bo'sh joy ham haqiqiy nomning bir qismi bo'lishi mumkin (masalan "АКТ ТО ").
  return String(input.sheetName ?? input.mainSheetName ?? '');
}

function resolveConfig(req, { requireSheet = false } = {}) {
  const input = req.body || req.query || {};
  const workspace = req.workspace || {};
  const spreadsheetUrl = clean(workspace.spreadsheetUrl || input.spreadsheetUrl || input.spreadsheetId);
  const sheetName = requestedSheetTitle(req);

  if (!spreadsheetUrl) {
    const error = new Error('Google Sheets havolasi kiritilmagan');
    error.code = 'SHEET_URL_REQUIRED';
    throw error;
  }
  if (requireSheet && !sheetName.trim()) {
    const error = new Error('ASOSIY VAROQ nomi kiritilmagan');
    error.code = 'SHEET_NAME_REQUIRED';
    throw error;
  }

  let serviceAccountRaw = input.serviceAccount || parseServerServiceAccount();
  if (workspace.serviceAccountBase64) {
    const decoded = safeJsonParse(Buffer.from(workspace.serviceAccountBase64, 'base64').toString('utf8'));
    if (decoded) serviceAccountRaw = decoded;
  }

  return {
    spreadsheetUrl,
    sheetName,
    serviceAccount: validateServiceAccount(serviceAccountRaw),
  };
}

function resolveExistingSheetName(sheets, requested) {
  const raw = String(requested ?? '');
  if (sheets.includes(raw)) return raw;

  const wanted = raw.trim();
  if (!wanted) return '';

  // Foydalanuvchi oxirgi bo'sh joyni ko'rmay/yozmay qolsa ham, yagona mos varoqni topamiz.
  const normalizedMatches = sheets.filter((name) => String(name).trim() === wanted);
  if (normalizedMatches.length === 1) return normalizedMatches[0];
  if (normalizedMatches.length > 1) {
    const error = new Error(`Varaq nomi noaniq: ${wanted}. To'liq nomni tanlang.`);
    error.code = 'SHEET_NAME_AMBIGUOUS';
    error.matches = normalizedMatches;
    throw error;
  }

  const error = new Error(`ASOSIY VAROQ topilmadi: ${wanted}`);
  error.code = 'SHEET_NAME_NOT_FOUND';
  error.sheets = sheets;
  throw error;
}

function normalizeHeader(value) {
  return clean(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s._:,;№#()\-\/\\]+/g, '');
}

const HEADER_ALIASES = {
  no: ['n', 'no', 'номер', 'пп', 'номерпп'],
  serialNo: ['зав', 'завномер', 'заводскойномер', 'серийныйномер', 'serial', 'serialno'],
  equipmentName: ['наименованиеоборудования', 'наименование', 'оборудование', 'прибор'],
  positionNo: ['поз', 'позномер', 'позиция', 'position'],
  quantity: ['колвошт', 'колво', 'количество', 'qty', 'quantity'],
  technicalState: ['техническоесостояние', 'техсостояние', 'состояние', 'condition'],
  workType: ['видработ', 'видработы', 'переченьвр', 'работа', 'worktype'],
  note: ['примечание', 'замечание', 'комментарий', 'note'],
};

function aliasIndex(normalizedRow, aliases) {
  return normalizedRow.findIndex((cell) => aliases.includes(cell));
}

function findHeader(rows) {
  const scanLimit = Math.min(rows.length, 80);
  for (let index = 0; index < scanLimit; index += 1) {
    const normalized = (rows[index] || []).map(normalizeHeader);
    const map = {};
    let score = 0;

    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      const found = aliasIndex(normalized, aliases);
      if (found >= 0) {
        map[field] = found;
        score += 1;
      }
    }

    if (score >= 5 && map.serialNo !== undefined && map.equipmentName !== undefined) {
      return { index, map };
    }
  }
  return { index: -1, map: {} };
}

function valueAt(row, index) {
  if (index === undefined || index === null || index < 0) return '';
  return clean(row[index]);
}

function isNumericLike(value) {
  const text = clean(value);
  if (!text) return false;
  return /^\d+(?:[.,]\d+)?$/.test(text);
}

function isGroupHeading(row, map) {
  const first = valueAt(row, map.no ?? 0);
  if (!first || isNumericLike(first)) return false;
  const otherFields = ['serialNo', 'equipmentName', 'positionNo', 'quantity', 'technicalState', 'workType', 'note'];
  return otherFields.every((field) => !valueAt(row, map[field]));
}

function isConclusionRow(row) {
  const text = (row || []).map((cell) => clean(cell).toLowerCase()).join(' ');
  return text.includes('заключение') || text.includes('хулоса');
}

function isUsableDataRow(row, map) {
  return [
    valueAt(row, map.serialNo),
    valueAt(row, map.equipmentName),
    valueAt(row, map.positionNo),
    valueAt(row, map.quantity),
    valueAt(row, map.technicalState),
    valueAt(row, map.workType),
    valueAt(row, map.note),
  ].some(Boolean);
}

export function parseToSheetRows(rows = []) {
  const { index: headerIndex, map } = findHeader(rows);
  if (headerIndex < 0) {
    const error = new Error('TO jurnal sarlavha qatori topilmadi');
    error.code = 'TO_HEADER_NOT_FOUND';
    throw error;
  }

  const sections = [];
  let currentSection = null;

  const createSection = (name) => {
    const section = { name: clean(name) || 'ASOSIY', items: [] };
    sections.push(section);
    return section;
  };

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    if (!row.some((cell) => clean(cell))) continue;
    if (isConclusionRow(row)) break;

    if (isGroupHeading(row, map)) {
      currentSection = createSection(valueAt(row, map.no ?? 0));
      continue;
    }

    if (!isUsableDataRow(row, map)) continue;
    if (!currentSection) currentSection = createSection('ASOSIY');

    currentSection.items.push({
      sourceRowNumber: index + 1,
      no: valueAt(row, map.no ?? 0),
      serialNo: valueAt(row, map.serialNo),
      equipmentName: valueAt(row, map.equipmentName),
      positionNo: valueAt(row, map.positionNo),
      quantity: valueAt(row, map.quantity),
      technicalState: valueAt(row, map.technicalState),
      workType: valueAt(row, map.workType),
      note: valueAt(row, map.note),
    });
  }

  const totalItems = sections.reduce((sum, section) => sum + section.items.length, 0);
  return {
    headerRowNumber: headerIndex + 1,
    sections,
    totalItems,
  };
}

// TO JURNALI ko'rinishi o'zining rasmiy 8 ustunli strukturasini saqlaydi.
// АКТ ТО manbasidagi Poz., kol-vo va Texnik holat alohida target ustuniga ega emas,
// shuning uchun ularni boshqa ustunlarga qo'shib yubormaymiz. Ular sourceMeta ichida saqlanadi.
export function buildToJournalView(parsed = {}) {
  const sections = (parsed.sections || []).map((section) => ({
    name: section.name,
    items: (section.items || []).map((item) => ({
      sourceRowNumber: item.sourceRowNumber,
      no: item.no,
      equipmentName: item.equipmentName,
      serialNo: item.serialNo,
      workType: item.workType,
      note: item.note,
      sourceMeta: {
        positionNo: item.positionNo,
        quantity: item.quantity,
        technicalState: item.technicalState,
      },
    })),
  }));

  return {
    ...parsed,
    sections,
  };
}

router.post('/settings/test', async (req, res) => {
  try {
    const config = resolveConfig(req);
    const sheets = await listSheets(config);
    const requested = requestedSheetTitle(req);
    const sheetName = requested.trim() ? resolveExistingSheetName(sheets, requested) : '';
    res.json({
      ok: true,
      sheets,
      sheetName,
      sheetExists: Boolean(sheetName),
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message,
      code: error.code || 'TO_SETTINGS_TEST_FAILED',
      sheets: error.sheets || [],
      matches: error.matches || [],
    });
  }
});

router.post('/source', async (req, res) => {
  try {
    const config = resolveConfig(req, { requireSheet: true });
    const sheets = await listSheets(config);
    const sheetName = resolveExistingSheetName(sheets, config.sheetName);
    const rows = await readSheetRows({ ...config, sheetName, range: 'A:H' });
    const parsed = parseToSheetRows(rows);
    const view = buildToJournalView(parsed);

    res.json({
      ok: true,
      sheetName,
      rowsRead: rows.length,
      ...view,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message,
      code: error.code || 'TO_SOURCE_READ_FAILED',
      sheets: error.sheets || [],
      matches: error.matches || [],
    });
  }
});

export default router;
