import express from 'express';
import { listSheets, readSheetRows, validateServiceAccount } from '../services/googleSheetsService.js';
import { requireWorkspaceRequestPermission } from '../middleware/workspaceAccess.js';
import { requireAccessToken } from '../middleware/auth.js';
import {
  backfillToPeriodEditableFields,
  updateToPeriodApprovalAssignments,
  updateToPeriodSheetState,
} from '../repositories/toPeriodRepository.js';
import {
  applyToPeriodSheetParsed,
  createToPeriodFromParsed,
  deriveToDocumentDate,
  getToPeriod,
  listToPeriodSummaries,
  normalizeToAssignedApprovers,
  normalizeToPeriod,
  patchToPeriodItem,
} from '../services/toPeriodService.js';
import {
  ensureToPeriodSheet,
  mergeDuplicateToPeriodSheets,
  readToPeriodSheetEditableFields,
  readToPeriodSheetRows,
  syncToPeriodSheet,
} from '../services/toPeriodSheetsService.js';

const router = express.Router();

function workspaceGuards(permission) {
  const authorizeWorkspace = requireWorkspaceRequestPermission(permission);
  return (req, res, next) => requireAccessToken(req, res, () => authorizeWorkspace(req, res, next));
}

router.use(workspaceGuards('workspace:read'));
const requireToWrite = requireWorkspaceRequestPermission('documents:create');
const requireToManageSheets = requireWorkspaceRequestPermission('workspace:update');

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
  return String(
    input.sheetName
    ?? input.mainSheetName
    ?? req.workspace?.moduleSettings?.to_sheet_name
    ?? '',
  );
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

export function buildToJournalView(parsed = {}) {
  return parsed;
}

function apiError(res, error, fallbackCode = 'TO_REQUEST_FAILED') {
  const knownStatus = Number(error?.statusCode);
  const status = knownStatus || (String(error?.code || '').startsWith('TO_') ? 400 : 500);
  return res.status(status).json({
    ok: false,
    error: error?.message || 'TO request failed',
    code: error?.code || fallbackCode,
    sheets: error?.sheets || [],
    matches: error?.matches || [],
  });
}

async function setPeriodSyncError(workspaceId, periodId, error) {
  try {
    await updateToPeriodSheetState(workspaceId, periodId, {
      syncStatus: 'error',
      syncError: error?.message || 'Google Sheets sync xatosi',
    });
  } catch (_) {}
}

async function restoreSnapshotEditableFields(bundle) {
  if (!bundle?.period?.id) return bundle;
  const snapshotItems = (bundle.period.sourceSnapshot?.sections || [])
    .flatMap((section) => section?.items || []);
  const sourceByRow = new Map(snapshotItems.map((item) => [Number(item.sourceRowNumber), item]));
  const backfillRows = (bundle.items || []).map((item) => ({
    sourceRowNumber: Number(item.sourceRowNumber),
    technicalState: clean(sourceByRow.get(Number(item.sourceRowNumber))?.technicalState),
    workType: clean(sourceByRow.get(Number(item.sourceRowNumber))?.workType),
    note: clean(sourceByRow.get(Number(item.sourceRowNumber))?.note),
  })).filter((row) => row.technicalState || row.workType || row.note);
  await backfillToPeriodEditableFields(
    bundle.period.workspaceId,
    bundle.period.id,
    backfillRows,
  );
  if (!snapshotItems.length) return bundle;
  return await getToPeriod(bundle.period.workspaceId, bundle.period.year, bundle.period.month) || bundle;
}

async function importLegacyPeriodSheet(config, inputBundle) {
  let bundle = await restoreSnapshotEditableFields(inputBundle);
  const legacyName = clean(bundle?.period?.monthlySheetName);
  if (!legacyName || legacyName.toUpperCase() === 'TO HISOBOT' || bundle.period.status !== 'draft') return bundle;
  const rows = await readToPeriodSheetRows({
    spreadsheetUrl: config.spreadsheetUrl,
    serviceAccount: config.serviceAccount,
    sheetName: legacyName,
  });
  const parsed = parseToSheetRows(rows);
  const currentByRow = new Map((bundle.items || []).map((item) => [Number(item.sourceRowNumber), item]));
  const reconciled = {
    ...parsed,
    sections: (parsed.sections || []).map((section) => ({
      ...section,
      items: (section.items || []).map((row) => {
        const current = currentByRow.get(Number(row.sourceRowNumber)) || {};
        return {
          ...row,
          technicalState: clean(row.technicalState) || clean(current.technicalState),
          workType: clean(row.workType) || clean(current.workType),
          note: clean(row.note) || clean(current.note),
        };
      }),
    })),
  };
  await applyToPeriodSheetParsed(bundle.period.workspaceId, bundle.period.year, bundle.period.month, reconciled);
  return await getToPeriod(bundle.period.workspaceId, bundle.period.year, bundle.period.month) || bundle;
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

    res.json({
      ok: true,
      sheetName,
      rowsRead: rows.length,
      ...buildToJournalView(parsed),
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

router.get('/periods', async (req, res) => {
  try {
    const periods = await listToPeriodSummaries(req.workspace.id, req.query.year ?? null);
    res.json({ ok: true, periods });
  } catch (error) {
    apiError(res, error, 'TO_PERIOD_LIST_FAILED');
  }
});

router.get('/periods/:year/:month', async (req, res) => {
  try {
    const bundle = await getToPeriod(req.workspace.id, req.params.year, req.params.month);
    if (!bundle) {
      const optional = ['1', 'true', 'yes'].includes(clean(req.query.optional).toLowerCase());
      if (optional) return res.json({ ok: true, exists: false, period: null, items: [] });
      return res.status(404).json({
        ok: false,
        error: 'TO davri topilmadi',
        code: 'TO_PERIOD_NOT_FOUND',
      });
    }
    return res.json({ ok: true, exists: true, ...bundle });
  } catch (error) {
    return apiError(res, error, 'TO_PERIOD_READ_FAILED');
  }
});

router.post('/periods', requireToWrite, async (req, res) => {
  try {
    const { year, month } = normalizeToPeriod(req.body?.year, req.body?.month);
    const existing = await getToPeriod(req.workspace.id, year, month);
    const config = resolveConfig(req, { requireSheet: !existing });

    let result;
    if (existing) {
      let period = existing.period;
      if (Array.isArray(req.body?.assignedApprovers)) {
        period = await updateToPeriodApprovalAssignments(
          req.workspace.id,
          existing.period.id,
          normalizeToAssignedApprovers(req.body.assignedApprovers),
        ) || existing.period;
      }
      result = { created: false, period, items: existing.items };
    } else {
      const sheets = await listSheets(config);
      const sourceSheetName = resolveExistingSheetName(sheets, config.sheetName);
      const rows = await readSheetRows({ ...config, sheetName: sourceSheetName, range: 'A:H' });
      const parsed = parseToSheetRows(rows);
      const documentDate = deriveToDocumentDate(rows, year, month, req.body?.documentDate || '');

      result = await createToPeriodFromParsed({
        workspaceId: req.workspace.id,
        year,
        month,
        documentDate,
        sourceSheetName,
        conclusion: req.body?.conclusion,
        parsed,
        assignedApprovers: normalizeToAssignedApprovers(req.body?.assignedApprovers),
        createdBy: req.auth?.userId || null,
      });
    }

    let sheet = null;
    let warning = '';
    try {
      if (!result.created) {
        const refreshed = await importLegacyPeriodSheet(config, { period: result.period, items: result.items });
        result.items = refreshed.items;
      }
      const ensured = await ensureToPeriodSheet({
        spreadsheetUrl: config.spreadsheetUrl,
        serviceAccount: config.serviceAccount,
        sourceSheetName: result.period.sourceSheetName,
        year: result.period.year,
        month: result.period.month,
        documentDate: String(result.period.documentDate),
        sourceRows: result.items.map((item) => item.sourceRowNumber),
        items: result.items,
      });

      await syncToPeriodSheet({
        spreadsheetUrl: config.spreadsheetUrl,
        serviceAccount: config.serviceAccount,
        sheetName: ensured.sheetName,
        items: result.items,
        reportRowMap: ensured.reportRowMap,
      });

      await updateToPeriodSheetState(req.workspace.id, result.period.id, {
        monthlySheetName: ensured.sheetName,
        syncStatus: 'synced',
        syncError: '',
        touchSyncTime: true,
      });
      sheet = ensured;
    } catch (sheetError) {
      warning = sheetError.message || 'Google Sheets sync xatosi';
      await setPeriodSyncError(req.workspace.id, result.period.id, sheetError);
    }

    const bundle = await getToPeriod(req.workspace.id, year, month);
    return res.status(result.created ? 201 : 200).json({
      ok: true,
      created: result.created,
      ...bundle,
      sheet,
      warning,
    });
  } catch (error) {
    return apiError(res, error, 'TO_PERIOD_CREATE_FAILED');
  }
});

router.patch('/periods/:year/:month/items/:itemId', requireToWrite, async (req, res) => {
  try {
    const result = await patchToPeriodItem(
      req.workspace.id,
      req.params.year,
      req.params.month,
      req.params.itemId,
      req.body || {},
    );

    let warning = '';
    if (req.body?.syncSheet !== false) {
      try {
        const config = resolveConfig(req);
        const bundle = await restoreSnapshotEditableFields(
          await getToPeriod(req.workspace.id, req.params.year, req.params.month),
        );
        const ensured = await ensureToPeriodSheet({
          spreadsheetUrl: config.spreadsheetUrl,
          serviceAccount: config.serviceAccount,
          sourceSheetName: result.period.sourceSheetName,
          year: result.period.year,
          month: result.period.month,
          documentDate: String(result.period.documentDate),
          sourceRows: bundle.items.map((item) => item.sourceRowNumber),
          items: bundle.items,
        });
        await syncToPeriodSheet({
          spreadsheetUrl: config.spreadsheetUrl,
          serviceAccount: config.serviceAccount,
          sheetName: ensured.sheetName,
          items: bundle.items,
          reportRowMap: ensured.reportRowMap,
        });
        await updateToPeriodSheetState(req.workspace.id, result.period.id, {
          monthlySheetName: ensured.sheetName,
          syncStatus: 'synced',
          syncError: '',
          touchSyncTime: true,
        });
      } catch (sheetError) {
        warning = sheetError.message || 'Google Sheets sync xatosi';
        await setPeriodSyncError(req.workspace.id, result.period.id, sheetError);
      }
    }

    return res.json({ ok: true, item: result.item, warning });
  } catch (error) {
    return apiError(res, error, 'TO_PERIOD_ITEM_UPDATE_FAILED');
  }
});

router.post('/periods/:year/:month/sync-to-sheet', requireToWrite, async (req, res) => {
  try {
    let bundle = await getToPeriod(req.workspace.id, req.params.year, req.params.month);
    if (!bundle) {
      return res.status(404).json({ ok: false, error: 'TO davri topilmadi', code: 'TO_PERIOD_NOT_FOUND' });
    }
    const config = resolveConfig(req);
    bundle = await importLegacyPeriodSheet(config, bundle);
    let sheetName = bundle.period.monthlySheetName;
    const ensured = await ensureToPeriodSheet({
        spreadsheetUrl: config.spreadsheetUrl,
        serviceAccount: config.serviceAccount,
        sourceSheetName: bundle.period.sourceSheetName,
        year: bundle.period.year,
        month: bundle.period.month,
        documentDate: String(bundle.period.documentDate),
        sourceRows: bundle.items.map((item) => item.sourceRowNumber),
        items: bundle.items,
      });
    sheetName = ensured.sheetName;

    const sync = await syncToPeriodSheet({
      spreadsheetUrl: config.spreadsheetUrl,
      serviceAccount: config.serviceAccount,
      sheetName,
      items: bundle.items,
      reportRowMap: ensured.reportRowMap,
    });
    await updateToPeriodSheetState(req.workspace.id, bundle.period.id, {
      monthlySheetName: sheetName,
      syncStatus: 'synced',
      syncError: '',
      touchSyncTime: true,
    });
    if (Array.isArray(req.body?.assignedApprovers)) {
      await updateToPeriodApprovalAssignments(
        req.workspace.id,
        bundle.period.id,
        normalizeToAssignedApprovers(req.body.assignedApprovers),
      );
    }

    return res.json({ ok: true, sheetName, ensured, sync });
  } catch (error) {
    const bundle = await getToPeriod(req.workspace.id, req.params.year, req.params.month).catch(() => null);
    if (bundle?.period?.id) await setPeriodSyncError(req.workspace.id, bundle.period.id, error);
    return apiError(res, error, 'TO_PERIOD_SYNC_TO_SHEET_FAILED');
  }
});

router.post('/periods/:year/:month/sync-from-sheet', requireToWrite, async (req, res) => {
  try {
    let bundle = await getToPeriod(req.workspace.id, req.params.year, req.params.month);
    if (!bundle) {
      return res.status(404).json({ ok: false, error: 'TO davri topilmadi', code: 'TO_PERIOD_NOT_FOUND' });
    }
    if (!bundle.period.monthlySheetName) {
      const error = new Error('TO oylik Google Sheets varog‘i hali yaratilmagan');
      error.code = 'TO_PERIOD_SHEET_NOT_CREATED';
      error.statusCode = 409;
      throw error;
    }

    const config = resolveConfig(req);
    bundle = await importLegacyPeriodSheet(config, bundle);
    const ensured = await ensureToPeriodSheet({
      spreadsheetUrl: config.spreadsheetUrl,
      serviceAccount: config.serviceAccount,
      sourceSheetName: bundle.period.sourceSheetName,
      year: bundle.period.year,
      month: bundle.period.month,
      documentDate: String(bundle.period.documentDate),
      sourceRows: bundle.items.map((item) => item.sourceRowNumber),
      items: bundle.items,
    });
    const sheetRows = await readToPeriodSheetEditableFields({
      spreadsheetUrl: config.spreadsheetUrl,
      serviceAccount: config.serviceAccount,
      sheetName: ensured.sheetName,
      reportRowMap: ensured.reportRowMap,
      sourceRows: bundle.items.map((item) => item.sourceRowNumber),
    });
    const currentByRow = new Map(bundle.items.map((item) => [Number(item.sourceRowNumber), item]));
    const rows = sheetRows.map((row) => {
      const current = currentByRow.get(Number(row.sourceRowNumber)) || {};
      return {
        ...row,
        technicalState: clean(row.technicalState) || clean(current.technicalState),
        workType: clean(row.workType) || clean(current.workType),
        note: clean(row.note) || clean(current.note),
      };
    });
    await syncToPeriodSheet({
      spreadsheetUrl: config.spreadsheetUrl,
      serviceAccount: config.serviceAccount,
      sheetName: ensured.sheetName,
      items: rows,
      reportRowMap: ensured.reportRowMap,
    });
    const applied = await applyToPeriodSheetParsed(
      req.workspace.id,
      bundle.period.year,
      bundle.period.month,
      { sections: [{ items: rows }] },
    );
    await updateToPeriodSheetState(req.workspace.id, bundle.period.id, {
      monthlySheetName: ensured.sheetName,
      syncStatus: 'synced',
      syncError: '',
      touchSyncTime: true,
    });
    const refreshed = await getToPeriod(req.workspace.id, bundle.period.year, bundle.period.month);
    return res.json({ ok: true, updated: applied.updated, ...refreshed });
  } catch (error) {
    const bundle = await getToPeriod(req.workspace.id, req.params.year, req.params.month).catch(() => null);
    if (bundle?.period?.id) await setPeriodSyncError(req.workspace.id, bundle.period.id, error);
    return apiError(res, error, 'TO_PERIOD_SYNC_FROM_SHEET_FAILED');
  }
});

router.post('/periods/:year/:month/dedup-sheets', requireToManageSheets, async (req, res) => {
  try {
    const { year, month } = normalizeToPeriod(req.params.year, req.params.month);
    const config = resolveConfig(req);
    const apply = ['1', 'true', 'yes', 'on'].includes(String(req.body?.apply ?? '').toLowerCase());
    const report = await mergeDuplicateToPeriodSheets({
      spreadsheetUrl: config.spreadsheetUrl,
      serviceAccount: config.serviceAccount,
      year,
      month,
      apply,
    });
    return res.json({ ok: true, ...report });
  } catch (error) {
    return apiError(res, error, 'TO_PERIOD_DEDUP_FAILED');
  }
});

export default router;
