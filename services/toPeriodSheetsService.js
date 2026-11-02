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

export function normalizeSheetTitle(title) {
  return String(title || '')
    .replace(/^(копия|copy)(\s+of)?\s*[:\-]?\s*/i, '')
    .replace(/\((копия|copy)\s*\d*\)\s*$/i, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function findPeriodSheets(allSheets = [], targetName = '') {
  const sheets = (allSheets || []).filter((sheet) => sheet?.properties);
  const wanted = normalizeSheetTitle(targetName);
  const matches = sheets.filter((sheet) => normalizeSheetTitle(sheet.properties.title) === wanted);
  const preferred = matches.find((sheet) => sheet.properties.title === targetName) || matches[0] || null;
  return { preferred, matches };
}

export function planDuplicatePeriodSheetMerge(canonicalRows = [], duplicateRows = [], sheetName = '') {
  const rowCount = Math.max(canonicalRows.length, duplicateRows.length);
  const copiedCells = [];
  const conflicts = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const canonicalRow = canonicalRows[rowIndex] || [];
    const duplicateRow = duplicateRows[rowIndex] || [];
    const merged = [];
    let added = 0;

    for (let column = 0; column < 26; column += 1) {
      const current = String(canonicalRow[column] ?? '').trim();
      const incoming = String(duplicateRow[column] ?? '').trim();
      if (column >= 5 && column <= 7) {
        if (current && incoming && current !== incoming) {
          conflicts.push({ sheet: sheetName, row: rowIndex + 1, column: colLetter(column + 1), reason: 'conflicting-edit' });
        }
        merged.push(current || incoming);
        if (!current && incoming) added += 1;
      } else {
        if (current !== incoming) {
          conflicts.push({ sheet: sheetName, row: rowIndex + 1, column: colLetter(column + 1), reason: 'other-data-differs' });
        }
      }
    }

    if (added) copiedCells.push({ sheet: sheetName, row: rowIndex + 1, values: merged.slice(0, 3) });
  }

  return { copiedCells, conflicts };
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
  const { preferred, matches } = findPeriodSheets(allSheets, targetName);
  let target = preferred;
  let created = false;
  let renamedFrom = '';

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
  } else if (target.properties?.title !== targetName) {
    renamedFrom = target.properties.title;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          updateSheetProperties: {
            properties: { sheetId: target.properties.sheetId, title: targetName },
            fields: 'title',
          },
        }],
      },
    });
    target = { ...target, properties: { ...target.properties, title: targetName } };
  }

  const duplicates = matches
    .filter((sheet) => sheet !== preferred)
    .map((sheet) => ({ title: sheet.properties.title, sheetId: sheet.properties.sheetId }));

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
    renamedFrom,
    duplicates,
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

export async function mergeDuplicateToPeriodSheets({
  spreadsheetUrl,
  serviceAccount,
  year,
  month,
  apply = false,
}) {
  const targetName = periodSheetTitle(year, month);
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  const sheets = await getSheetsClient(serviceAccount);
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const allSheets = meta.data.sheets || [];
  const { preferred, matches } = findPeriodSheets(allSheets, targetName);
  const duplicateSheets = matches.filter((sheet) => sheet !== preferred);

  if (!preferred || !duplicateSheets.length) {
    return {
      canonical: preferred?.properties?.title || null,
      duplicates: [],
      copiedCells: [],
      deleted: [],
      applied: false,
    };
  }

  const canonicalName = preferred.properties.title;
  const canonicalRows = await readSheetRows({
    spreadsheetUrl,
    serviceAccount,
    sheetName: canonicalName,
    range: 'A:Z',
  });

  const copiedCells = [];
  const conflicts = [];
  for (const duplicate of duplicateSheets) {
    const duplicateRows = await readSheetRows({
      spreadsheetUrl,
      serviceAccount,
      sheetName: duplicate.properties.title,
      range: 'A:Z',
    });
    const plan = planDuplicatePeriodSheetMerge(canonicalRows, duplicateRows, duplicate.properties.title);
    copiedCells.push(...plan.copiedCells);
    conflicts.push(...plan.conflicts);
  }

  if (conflicts.length) {
    return {
      canonical: canonicalName,
      duplicates: duplicateSheets.map((sheet) => sheet.properties.title),
      copiedCells: copiedCells.map((cell) => ({ sheet: cell.sheet, row: cell.row })),
      conflicts,
      deleted: [],
      applied: false,
    };
  }

  const deleted = [];
  if (apply) {
    if (copiedCells.length) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: copiedCells.map((cell) => ({
            range: `${q(canonicalName)}!F${cell.row}:H${cell.row}`,
            values: [cell.values],
          })),
        },
      });
    }
    for (const duplicate of duplicateSheets) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ deleteSheet: { sheetId: duplicate.properties.sheetId } }],
        },
      });
      deleted.push(duplicate.properties.title);
    }
    if (canonicalName !== targetName) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            updateSheetProperties: {
              properties: { sheetId: preferred.properties.sheetId, title: targetName },
              fields: 'title',
            },
          }],
        },
      });
    }
  }

  return {
    canonical: canonicalName,
    duplicates: duplicateSheets.map((sheet) => sheet.properties.title),
    copiedCells: copiedCells.map((cell) => ({ sheet: cell.sheet, row: cell.row })),
    conflicts: [],
    deleted,
    applied: Boolean(apply),
  };
}
