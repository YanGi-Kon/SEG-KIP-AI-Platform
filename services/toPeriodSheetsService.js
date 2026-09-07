import {
  extractSpreadsheetId,
  getSheetsClient,
  readSheetRows,
} from './googleSheetsService.js';

const RU_MONTHS = [
  '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function q(sheetName) {
  return `'${String(sheetName || '').replace(/'/g, "''")}'`;
}

function colLetter(index) {
  let n = Number(index);
  let result = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    result = String.fromCharCode(65 + mod) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

export function periodSheetTitle(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error('TO davri noto‘g‘ri');
  }
  return `ТО — ${RU_MONTHS[m]} ${y}`;
}

export function formatToPeriodDocumentDate(documentDate) {
  const match = String(documentDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('TO hujjat sanasi noto‘g‘ri');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!RU_MONTHS[month] || day < 1 || day > 31) throw new Error('TO hujjat sanasi noto‘g‘ri');
  return `«${day}» ${RU_MONTHS[month]} ${year}г.`;
}

function contiguousRanges(rowNumbers = []) {
  const rows = [...new Set(rowNumbers.map(Number).filter((row) => Number.isInteger(row) && row > 0))].sort((a, b) => a - b);
  if (!rows.length) return [];
  const ranges = [];
  let start = rows[0];
  let prev = rows[0];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row === prev + 1) {
      prev = row;
      continue;
    }
    ranges.push([start, prev]);
    start = row;
    prev = row;
  }
  ranges.push([start, prev]);
  return ranges;
}

async function updatePeriodDateCell({ sheets, spreadsheetId, sheetName, documentDate }) {
  const wanted = formatToPeriodDocumentDate(documentDate);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(sheetName)}!A1:H80`,
    valueRenderOption: 'FORMATTED_VALUE',
  }).catch(() => ({ data: { values: [] } }));

  const rows = response.data.values || [];
  const pattern = /«\s*\d{1,2}\s*»\s+[А-Яа-яЁё]+\s+\d{4}\s*г\.?/u;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const value = String(row[columnIndex] || '');
      if (!pattern.test(value)) continue;
      const nextValue = value.replace(pattern, wanted);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${q(sheetName)}!${colLetter(columnIndex + 1)}${rowIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[nextValue]] },
      });
      return true;
    }
  }
  return false;
}

async function clearMonthlyEditableFields({ sheets, spreadsheetId, sheetName, sourceRows }) {
  const ranges = contiguousRanges(sourceRows).map(([start, end]) => (
    `${q(sheetName)}!F${start}:H${end}`
  ));
  if (!ranges.length) return;
  await sheets.spreadsheets.values.batchClear({
    spreadsheetId,
    requestBody: { ranges },
  });
}

export async function ensureToPeriodSheet({
  spreadsheetUrl,
  serviceAccount,
  sourceSheetName,
  year,
  month,
  documentDate,
  sourceRows = [],
}) {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  const sheets = await getSheetsClient(serviceAccount);
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const allSheets = meta.data.sheets || [];
  const source = allSheets.find((sheet) => sheet.properties?.title === sourceSheetName);
  if (!source?.properties?.sheetId && source?.properties?.sheetId !== 0) {
    const error = new Error(`ASOSIY VAROQ topilmadi: ${sourceSheetName}`);
    error.code = 'TO_SOURCE_SHEET_NOT_FOUND';
    throw error;
  }

  const targetName = periodSheetTitle(year, month);
  let target = allSheets.find((sheet) => sheet.properties?.title === targetName);
  let created = false;

  if (!target) {
    const duplicated = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          duplicateSheet: {
            sourceSheetId: source.properties.sheetId,
            newSheetName: targetName,
          },
        }],
      },
    });
    target = duplicated.data.replies?.[0]?.duplicateSheet || null;
    created = true;
  }

  if (created) {
    await clearMonthlyEditableFields({
      sheets,
      spreadsheetId,
      sheetName: targetName,
      sourceRows,
    });
  }

  const dateUpdated = await updatePeriodDateCell({
    sheets,
    spreadsheetId,
    sheetName: targetName,
    documentDate,
  });

  return {
    sheetName: targetName,
    sheetId: target?.properties?.sheetId ?? target?.sheetId ?? null,
    created,
    dateUpdated,
  };
}

export async function syncToPeriodSheet({
  spreadsheetUrl,
  serviceAccount,
  sheetName,
  items = [],
}) {
  if (!sheetName) throw new Error('TO oylik Google Sheets varog‘i belgilanmagan');
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  const sheets = await getSheetsClient(serviceAccount);
  const data = items
    .filter((item) => Number(item.sourceRowNumber) > 0)
    .map((item) => ({
      range: `${q(sheetName)}!F${Number(item.sourceRowNumber)}:H${Number(item.sourceRowNumber)}`,
      values: [[
        String(item.technicalState || ''),
        String(item.workType || ''),
        String(item.note || ''),
      ]],
    }));

  if (!data.length) return { updatedRows: 0 };
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });
  return { updatedRows: data.length };
}

export async function readToPeriodSheetRows({
  spreadsheetUrl,
  serviceAccount,
  sheetName,
}) {
  return readSheetRows({
    spreadsheetUrl,
    serviceAccount,
    sheetName,
    range: 'A:H',
  });
}
