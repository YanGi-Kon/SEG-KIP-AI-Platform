import {
  appendJournalReportRows as appendJournalReportRowsRecord,
  getJournalReportBundle,
  listJournalReports as listJournalReportRecords,
} from '../repositories/journalReportRepository.js';

const MONTHS = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function clean(value) {
  return String(value ?? '').trim();
}

function badRequest(message, code) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  return error;
}

export function normalizeJournalReportPeriod(yearRaw, monthRaw) {
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw badRequest('ЖУРНАЛ УЧЕТА ҳисобот йили нотўғри.', 'JOURNAL_REPORT_YEAR_INVALID');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw badRequest('ЖУРНАЛ УЧЕТА ҳисобот ойи нотўғри.', 'JOURNAL_REPORT_MONTH_INVALID');
  }
  return { year, month, monthName: MONTHS[month] || String(month) };
}

function normalizeDocumentDate(value, year, month) {
  const raw = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw badRequest('Ҳужжат санасини YYYY-MM-DD кўринишида танланг.', 'JOURNAL_DOCUMENT_DATE_INVALID');
  }
  const [dateYear, dateMonth, dateDay] = raw.split('-').map(Number);
  const date = new Date(Date.UTC(dateYear, dateMonth - 1, dateDay));
  const valid = date.getUTCFullYear() === dateYear
    && date.getUTCMonth() + 1 === dateMonth
    && date.getUTCDate() === dateDay;
  if (!valid) throw badRequest('Ҳужжат санаси ҳақиқий эмас.', 'JOURNAL_DOCUMENT_DATE_INVALID');
  if (dateYear !== year || dateMonth !== month) {
    throw badRequest(
      'Ҳужжат санаси танланган ой ва йил ичида бўлиши керак.',
      'JOURNAL_DOCUMENT_DATE_OUTSIDE_PERIOD',
    );
  }
  return raw;
}

function normalizeRow(row = {}, index = 0) {
  const sourceRowNumber = Number(row.sourceRowNumber || row._periodBaseRowNumber || row._rowNumber || 0) || null;
  const fallback = [
    clean(row.date),
    clean(row.pos),
    clean(row.name),
    clean(row.brand),
    clean(row.serial),
    clean(row.range),
    clean(row.location),
    clean(row.skv),
    clean(row.work),
  ].join('|');
  const sourceKey = clean(row.sourceKey) || (sourceRowNumber ? `base:${sourceRowNumber}` : `data:${fallback}`);
  return {
    sourceKey,
    sourceRowNumber,
    date: clean(row.date),
    pos: clean(row.pos),
    name: clean(row.name),
    brand: clean(row.brand),
    serial: clean(row.serial),
    range: clean(row.range),
    location: clean(row.location),
    skv: clean(row.skv),
    work: clean(row.work),
    executor: clean(row.executor),
    signature: clean(row.signature),
  };
}

export async function listJournalReportFolders(workspaceId) {
  const reports = await listJournalReportRecords(workspaceId);
  return reports.map((report) => ({
    ...report,
    label: `${MONTHS[report.month] || report.month} ${report.year}`,
  }));
}

export async function getJournalReport(workspaceId, yearRaw, monthRaw) {
  const { year, month } = normalizeJournalReportPeriod(yearRaw, monthRaw);
  return getJournalReportBundle(workspaceId, year, month);
}

export async function appendJournalReportRows(input = {}) {
  const { year, month } = normalizeJournalReportPeriod(input.year, input.month);
  const documentDate = normalizeDocumentDate(input.documentDate, year, month);
  const rows = (Array.isArray(input.rows) ? input.rows : [])
    .map(normalizeRow)
    .filter((row) => row.sourceKey && (
      row.date || row.pos || row.name || row.brand || row.serial
      || row.location || row.skv || row.work || row.executor || row.signature
    ));

  if (!rows.length) {
    throw badRequest('Ҳужжатга қўшиш учун камида битта қатор танланг.', 'JOURNAL_REPORT_ROWS_REQUIRED');
  }

  return appendJournalReportRowsRecord({
    workspaceId: input.workspaceId,
    year,
    month,
    documentDate,
    sourceSheetName: clean(input.sourceSheetName),
    rows,
    createdBy: input.createdBy || null,
  });
}
