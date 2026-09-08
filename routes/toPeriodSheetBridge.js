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
import { parseToSheetRows } from './to.js';

const router = express.Router();

const RU_MONTHS = [
  '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

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

function workspaceServiceAccount(workspace = {}) {
  if (workspace.serviceAccountBase64) {
    const decoded = safeJsonParse(
      Buffer.from(workspace.serviceAccountBase64, 'base64').toString('utf8'),
    );
    if (decoded) return validateServiceAccount(decoded);
  }
  return validateServiceAccount(parseServerServiceAccount());
}

function requestedSheetTitle(req) {
  return String(
    req.body?.sheetName
    ?? req.workspace?.moduleSettings?.to_sheet_name
    ?? '',
  );
}

function resolveExistingSheetName(sheets, requested) {
  const raw = String(requested ?? '');
  if (sheets.includes(raw)) return raw;

  const wanted = raw.trim();
  if (!wanted) {
    const error = new Error('ASOSIY VAROQ nomi kiritilmagan');
    error.code = 'SHEET_NAME_REQUIRED';
    throw error;
  }

  const normalizedMatches = sheets.filter((name) => String(name).trim() === wanted);
  if (normalizedMatches.length === 1) return normalizedMatches[0];
  if (normalizedMatches.length > 1) {
    const error = new Error(`Varaq nomi noaniq: ${wanted}. To‘liq nomni tanlang.`);
    error.code = 'SHEET_NAME_AMBIGUOUS';
    throw error;
  }

  const error = new Error(`ASOSIY VAROQ topilmadi: ${wanted}`);
  error.code = 'SHEET_NAME_NOT_FOUND';
  throw error;
}

function normalizePeriod(yearRaw, monthRaw) {
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    const error = new Error('TO davri yili noto‘g‘ri');
    error.code = 'TO_PERIOD_YEAR_INVALID';
    throw error;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    const error = new Error('TO davri oyi noto‘g‘ri');
    error.code = 'TO_PERIOD_MONTH_INVALID';
    throw error;
  }

  return { year, month, monthName: RU_MONTHS[month] };
}

function quoteSheetName(sheetName) {
  return `'${String(sheetName).replace(/'/g, "''")}'`;
}

router.use(requireAccessToken);
router.use(requireWorkspaceRequestPermission('documents:create'));

router.post('/select', async (req, res) => {
  try {
    const { year, month, monthName } = normalizePeriod(req.body?.year, req.body?.month);
    const workspace = req.workspace || {};
    const spreadsheetUrl = clean(workspace.spreadsheetUrl);

    if (!spreadsheetUrl) {
      const error = new Error('Google Sheets havolasi kiritilmagan');
      error.code = 'SHEET_URL_REQUIRED';
      throw error;
    }

    const serviceAccount = workspaceServiceAccount(workspace);
    const sheetsList = await listSheets({ spreadsheetUrl, serviceAccount });
    const sheetName = resolveExistingSheetName(sheetsList, requestedSheetTitle(req));
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    const sheets = await getSheetsClient(serviceAccount);

    // IMPORTANT: yilni RAW rejimida yozamiz. Aks holda Google Sheets "2026" ni
    // raqamga aylantiradi, holbuki База!L ustunida yil matn sifatida saqlangan.
    // FILTER formulalaridagi tenglik taqqoslashda bu tip farqi natijani bo‘sh qoldirardi.
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${quoteSheetName(sheetName)}!B7:C7`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[monthName, String(year)]],
      },
    });

    const rows = await readSheetRows({
      spreadsheetUrl,
      serviceAccount,
      sheetName,
      range: 'A:H',
    });
    const parsed = parseToSheetRows(rows);

    return res.json({
      ok: true,
      sheetName,
      selector: {
        year,
        month,
        monthName,
        monthCell: 'B7',
        yearCell: 'C7',
      },
      rowsRead: rows.length,
      ...parsed,
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error?.message || 'TO davrini Google Sheets’da tanlash xatosi',
      code: error?.code || 'TO_SHEET_PERIOD_SELECT_FAILED',
    });
  }
});

export default router;
