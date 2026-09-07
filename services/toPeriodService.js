import {
  createToPeriodRecord,
  getToPeriodBundle,
  listToPeriods,
  replaceToPeriodEditableFields,
  updateToPeriodItem,
} from '../repositories/toPeriodRepository.js';

const DEFAULT_CONCLUSION = 'Заключение: оборудование исправно и пригодно к эксплуатации';

export function normalizeToPeriod(year, month) {
  const normalizedYear = Number(year);
  const normalizedMonth = Number(month);
  if (!Number.isInteger(normalizedYear) || normalizedYear < 2000 || normalizedYear > 2100) {
    const error = new Error('TO davri yili noto‘g‘ri');
    error.code = 'TO_PERIOD_YEAR_INVALID';
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isInteger(normalizedMonth) || normalizedMonth < 1 || normalizedMonth > 12) {
    const error = new Error('TO davri oyi noto‘g‘ri');
    error.code = 'TO_PERIOD_MONTH_INVALID';
    error.statusCode = 400;
    throw error;
  }
  return { year: normalizedYear, month: normalizedMonth };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function deriveToDocumentDate(rows, year, month, requestedDate = '') {
  const period = normalizeToPeriod(year, month);
  const raw = String(requestedDate || '').trim();
  if (raw) {
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      const error = new Error('Hujjat sanasi YYYY-MM-DD formatida bo‘lishi kerak');
      error.code = 'TO_DOCUMENT_DATE_INVALID';
      error.statusCode = 400;
      throw error;
    }
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (y !== period.year || m !== period.month || d < 1 || d > daysInMonth(y, m)) {
      const error = new Error('Hujjat sanasi tanlangan TO davriga mos emas');
      error.code = 'TO_DOCUMENT_DATE_PERIOD_MISMATCH';
      error.statusCode = 400;
      throw error;
    }
    return raw;
  }

  const datePattern = /«\s*(\d{1,2})\s*»\s+[А-Яа-яЁё]+\s+\d{4}\s*г\.?/u;
  let day = null;
  for (const row of rows || []) {
    for (const cell of row || []) {
      const found = String(cell || '').match(datePattern);
      if (found) {
        day = Number(found[1]);
        break;
      }
    }
    if (day) break;
  }

  const safeDay = Math.min(
    Number.isInteger(day) && day > 0 ? day : 25,
    daysInMonth(period.year, period.month),
  );
  return `${period.year}-${String(period.month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

export function buildToPeriodItems(parsed = {}) {
  const items = [];
  for (const section of parsed.sections || []) {
    for (const item of section.items || []) {
      if (!Number(item.sourceRowNumber)) continue;
      items.push({
        sourceRowNumber: Number(item.sourceRowNumber),
        sectionName: String(section.name || 'ASOSIY').trim() || 'ASOSIY',
        no: String(item.no || '').trim(),
        serialNo: String(item.serialNo || '').trim(),
        equipmentName: String(item.equipmentName || '').trim(),
        positionNo: String(item.positionNo || '').trim(),
        quantity: String(item.quantity || '').trim(),
        technicalState: '',
        workType: '',
        note: '',
      });
    }
  }
  return items;
}

export async function createToPeriodFromParsed(input = {}) {
  const { year, month } = normalizeToPeriod(input.year, input.month);
  const items = buildToPeriodItems(input.parsed || {});
  if (!items.length) {
    const error = new Error('TO davri uchun uskuna qatorlari topilmadi');
    error.code = 'TO_PERIOD_ITEMS_EMPTY';
    error.statusCode = 400;
    throw error;
  }

  return createToPeriodRecord({
    workspaceId: input.workspaceId,
    year,
    month,
    documentDate: input.documentDate,
    sourceSheetName: input.sourceSheetName,
    conclusion: String(input.conclusion || DEFAULT_CONCLUSION),
    sourceSnapshot: {
      headerRowNumber: input.parsed?.headerRowNumber || null,
      totalItems: input.parsed?.totalItems || items.length,
      sections: input.parsed?.sections || [],
    },
    items,
    createdBy: input.createdBy || null,
  });
}

export async function listToPeriodSummaries(workspaceId, year = null) {
  if (year != null && year !== '') normalizeToPeriod(year, 1);
  return listToPeriods(workspaceId, { year: year == null || year === '' ? null : Number(year) });
}

export async function getToPeriod(workspaceId, year, month) {
  const period = normalizeToPeriod(year, month);
  return getToPeriodBundle(workspaceId, period.year, period.month);
}

export async function patchToPeriodItem(workspaceId, year, month, itemId, patch = {}) {
  const bundle = await getToPeriod(workspaceId, year, month);
  if (!bundle) {
    const error = new Error('TO davri topilmadi');
    error.code = 'TO_PERIOD_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  if (bundle.period.status !== 'draft') {
    const error = new Error('Yakunlangan TO davrini tahrirlab bo‘lmaydi');
    error.code = 'TO_PERIOD_LOCKED';
    error.statusCode = 409;
    throw error;
  }

  const item = await updateToPeriodItem(workspaceId, bundle.period.id, itemId, patch);
  if (!item) {
    const error = new Error('TO qatori topilmadi');
    error.code = 'TO_PERIOD_ITEM_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  return { period: bundle.period, item };
}

export function editableRowsFromParsed(parsed = {}) {
  const rows = [];
  for (const section of parsed.sections || []) {
    for (const item of section.items || []) {
      if (!Number(item.sourceRowNumber)) continue;
      rows.push({
        sourceRowNumber: Number(item.sourceRowNumber),
        technicalState: String(item.technicalState || '').trim(),
        workType: String(item.workType || '').trim(),
        note: String(item.note || '').trim(),
      });
    }
  }
  return rows;
}

export async function applyToPeriodSheetParsed(workspaceId, year, month, parsed = {}) {
  const bundle = await getToPeriod(workspaceId, year, month);
  if (!bundle) {
    const error = new Error('TO davri topilmadi');
    error.code = 'TO_PERIOD_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  if (bundle.period.status !== 'draft') {
    const error = new Error('Yakunlangan TO davriga Sheets’dan ma’lumot olib bo‘lmaydi');
    error.code = 'TO_PERIOD_LOCKED';
    error.statusCode = 409;
    throw error;
  }

  const rows = editableRowsFromParsed(parsed);
  const result = await replaceToPeriodEditableFields(workspaceId, bundle.period.id, rows);
  return { ...result, rows };
}
