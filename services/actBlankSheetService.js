import { getSheetsClient, extractSpreadsheetId, ensureSheet, readSheetRows } from './googleSheetsService.js';

const DAILY_SHEET_NAME = 'АКТЛАР_КУНЛИК';
const REGISTRY_SHEET_NAME = 'АКТЛАР_РЕЕСТР';
const BLANK_COLUMNS = 10;
const REGISTRY_HEADERS = [
  'actNo', 'sourceSheet', 'sourceRowNumber', 'sourceKey', 'status', 'rowStart', 'createdAt',
  'date', 'deviceName', 'serialNo', 'place', 'executor', 'a4Html', 'a4Json'
];

function q(sheetName) {
  return `'${String(sheetName).replace(/'/g, "''")}'`;
}

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function pad(row, cols = BLANK_COLUMNS) {
  const out = Array(cols).fill('');
  row.forEach((v, i) => {
    if (i < cols) out[i] = v;
  });
  return out;
}

function safeText(value = '') {
  return String(value || '').trim();
}

function border(style = 'SOLID') {
  return { style, width: 1, color: { red: 0, green: 0, blue: 0 } };
}

async function ensureRegistrySheet({ spreadsheetUrl, serviceAccount }) {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  const sheets = await getSheetsClient(serviceAccount);
  const sheetId = await ensureSheet({ spreadsheetUrl, serviceAccount, sheetName: REGISTRY_SHEET_NAME });
  const lastCol = colLetter(REGISTRY_HEADERS.length);
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(REGISTRY_SHEET_NAME)}!A1:${lastCol}1`
  }).catch(() => ({ data: { values: [] } }));
  const header = current.data.values?.[0] || [];
  const needsHeader = REGISTRY_HEADERS.some((h, i) => String(header[i] || '').trim() !== h);
  if (needsHeader) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${q(REGISTRY_SHEET_NAME)}!A1:${lastCol}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [REGISTRY_HEADERS] }
    });
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
          { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.05, green: 0.22, blue: 0.30 }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)' } },
          { autoResizeDimensions: { dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: REGISTRY_HEADERS.length } } }
        ]
      }
    }).catch(() => {});
  }
  return { sheets, spreadsheetId, sheetId };
}

async function ensureDisplaySheet({ spreadsheetUrl, serviceAccount }) {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  const sheets = await getSheetsClient(serviceAccount);
  const sheetId = await ensureSheet({ spreadsheetUrl, serviceAccount, sheetName: DAILY_SHEET_NAME });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 0, hideGridlines: true } }, fields: 'gridProperties(frozenRowCount,hideGridlines)' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 118 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 112 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 112 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 112 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 95 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } }
      ]
    }
  }).catch(() => {});
  return { sheets, spreadsheetId, sheetId };
}

async function nextDisplayStartRow({ spreadsheetUrl, serviceAccount }) {
  try {
    const rows = await readSheetRows({ spreadsheetUrl, serviceAccount, sheetName: DAILY_SHEET_NAME, range: `A:${colLetter(BLANK_COLUMNS)}` });
    const last = rows.reduce((max, row, idx) => row.some(v => String(v || '').trim()) ? idx + 1 : max, 0);
    return last ? last + 4 : 1;
  } catch (_) {
    return 1;
  }
}

export async function getDailyReports({ spreadsheetUrl, serviceAccount }) {
  try {
    await ensureRegistrySheet({ spreadsheetUrl, serviceAccount });
    const rows = await readSheetRows({ spreadsheetUrl, serviceAccount, sheetName: REGISTRY_SHEET_NAME, range: `A:${colLetter(REGISTRY_HEADERS.length)}` });
    return rows.slice(1).filter(r => r.some(c => String(c || '').trim())).map((r, idx) => ({
      no: idx + 1,
      actNo: r[0] || '',
      sourceSheet: r[1] || '',
      sourceRowNumber: r[2] || '',
      sourceKey: r[3] || '',
      status: r[4] || '',
      rowStart: r[5] || '',
      createdAt: r[6] || '',
      date: r[7] || '',
      device: r[8] || '',
      serial: r[9] || '',
      place: r[10] || '',
      executor: r[11] || '',
      a4Html: r[12] || '',
      a4Json: r[13] || '',
      rowNumber: idx + 2
    }));
  } catch (_) {
    return [];
  }
}

function nextActNo(existingRows) {
  const year = new Date().getFullYear();
  const nums = existingRows
    .map(r => String(r.actNo || '').match(new RegExp(`АКТ_${year}_(\\d+)`)))
    .filter(Boolean)
    .map(m => Number(m[1]))
    .filter(Number.isFinite);
  const next = nums.length ? Math.max(...nums) + 1 : existingRows.length + 1;
  return `АКТ_${year}_${String(next).padStart(4, '0')}`;
}

function buildActBlankRows(act, actNo) {
  return [
    pad(['', '', '', '', '', '', 'Низомга илова №4', '', '', '']),
    pad(['', '', '', '', '', '', '“SANEG” МЧЖ К/К объектларида', '', '', '']),
    pad(['', '', '', '', '', '', 'назорат ўлчов воситалари ва автоматлаштириш тизимларига', '', '', '']),
    pad(['', '', '', '', '', '', 'техник хизмат кўрсатиш бўйича', '', '', '']),
    pad(['', '', '', '', '', '', 'ТПП «Андижан»', '', '', '']),
    pad(['', '', '', '', '', '', '', '', '', '']),
    pad(['', '', 'ДАЛОЛАТНОМА №', actNo, '', '', '', '', '', '']),
    pad(['', '', 'Ўлчов воситасининг бузилиши', '', '', '', '', '', '', '']),
    pad(['', '', '', '', '', '', '', '', '', '']),
    pad(['Биз қуйида имзо чекувчилар:', '', '', '', '', '', '', '', '', '']),
    pad(['Ф.И.Ш.', safeText(act.person1), '', 'Лавозими', safeText(act.position1), '', 'Цех ва м/р', safeText(act.department1), '', '']),
    pad(['Ф.И.Ш.', safeText(act.person2), '', 'Лавозими', safeText(act.position2), '', 'Цех ва м/р', safeText(act.department2), '', '']),
    pad(['Ф.И.Ш.', safeText(act.person3), '', 'Лавозими', safeText(act.position3), '', 'Цех ва м/р', safeText(act.department3), '', '']),
    pad(['1. Ў.В. Ишлаш жойи:', '', '', '', '', '', '', '', '', '']),
    pad([safeText(act.workPlace), '', '', '', '', '', '', '', '', '']),
    pad(['2. Рад этиш мазмуни, санаси, вақти:', '', '', '', '', '', 'Сана:', safeText(act.date), '', '']),
    pad([safeText(act.failureText), '', '', '', '', '', '', '', '', '']),
    pad(['3. Носозликнинг технологик оқибатлари:', '', '', '', '', '', '', '', '', '']),
    pad([safeText(act.impactText), '', '', '', '', '', '', '', '', '']),
    pad(['4. Рад этиш сабаби:', '', '', '', '', '', '', '', '', '']),
    pad([safeText(act.reasonText), '', '', '', '', '', '', '', '', '']),
    pad(['5. Носозликни бартараф этиш бўйича оператив ҳаракатлар ва бартараф этиш вақти:', '', '', '', '', '', '', '', '', '']),
    pad([safeText(act.actionText), '', '', '', '', '', '', '', '', '']),
    pad(['Хулоса:', '', '', '', '', '', '', '', '', '']),
    pad([safeText(act.conclusion), '', '', '', '', '', '', '', '', '']),
    pad(['', '', '', '', '', '', '', '', '', '']),
    pad(['Имзолар:', '', '', '', '', '', '', '', '', '']),
    pad(['', '_________________', '', '', '_________________', '', '', '_________________', '', '']),
    pad(['', '(Лавозими)', '', '', '(Имзо)', '', '', '(Ф.И.Ш.)', '', '']),
    pad(['', '_________________', '', '', '_________________', '', '', '_________________', '', '']),
    pad(['', '(Лавозими)', '', '', '(Имзо)', '', '', '(Ф.И.Ш.)', '', ''])
  ];
}

function blockFormatRequests(sheetId, startRow, rowCount) {
  const s = startRow - 1;
  const e = s + rowCount;
  const requests = [];
  const mergeRanges = [
    [0, 6, 9], [1, 6, 9], [2, 6, 9], [3, 6, 9], [4, 6, 9],
    [6, 2, 8], [7, 2, 8], [9, 0, 10],
    [13, 0, 10], [14, 0, 10], [16, 0, 10], [17, 0, 10], [18, 0, 10],
    [19, 0, 10], [20, 0, 10], [21, 0, 10], [22, 0, 10], [23, 0, 10], [24, 0, 10], [26, 0, 10],
    [10, 1, 3], [10, 4, 6], [10, 7, 9], [11, 1, 3], [11, 4, 6], [11, 7, 9], [12, 1, 3], [12, 4, 6], [12, 7, 9]
  ];
  mergeRanges.forEach(([rowOffset, startCol, endCol]) => {
    requests.push({ mergeCells: { range: { sheetId, startRowIndex: s + rowOffset, endRowIndex: s + rowOffset + 1, startColumnIndex: startCol, endColumnIndex: endCol }, mergeType: 'MERGE_ALL' } });
  });
  requests.push(
    { repeatCell: { range: { sheetId, startRowIndex: s, endRowIndex: e, startColumnIndex: 0, endColumnIndex: BLANK_COLUMNS }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 }, fontFamily: 'Times New Roman', fontSize: 11 }, borders: { top: border(), bottom: border(), left: border(), right: border() } } }, fields: 'userEnteredFormat(backgroundColor,wrapStrategy,verticalAlignment,textFormat,borders)' } },
    { repeatCell: { range: { sheetId, startRowIndex: s, endRowIndex: s + 5, startColumnIndex: 6, endColumnIndex: 9 }, cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT', textFormat: { foregroundColor: { red: 0, green: 0, blue: 1 }, fontFamily: 'Times New Roman', fontSize: 11 } } }, fields: 'userEnteredFormat(horizontalAlignment,textFormat)' } },
    { repeatCell: { range: { sheetId, startRowIndex: s + 6, endRowIndex: s + 8, startColumnIndex: 0, endColumnIndex: BLANK_COLUMNS }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true, fontFamily: 'Times New Roman', fontSize: 13 } } }, fields: 'userEnteredFormat(horizontalAlignment,textFormat)' } },
    { repeatCell: { range: { sheetId, startRowIndex: s + 10, endRowIndex: s + 13, startColumnIndex: 0, endColumnIndex: BLANK_COLUMNS }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(horizontalAlignment)' } },
    { repeatCell: { range: { sheetId, startRowIndex: s + 27, endRowIndex: s + 31, startColumnIndex: 0, endColumnIndex: BLANK_COLUMNS }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { fontSize: 10, fontFamily: 'Times New Roman' } } }, fields: 'userEnteredFormat(horizontalAlignment,textFormat)' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: s, endIndex: e }, properties: { pixelSize: 28 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: s + 14, endIndex: s + 25 }, properties: { pixelSize: 58 }, fields: 'pixelSize' } }
  );
  return requests;
}

async function writeActBlankBlock({ spreadsheetUrl, serviceAccount, act, actNo }) {
  const { sheets, spreadsheetId, sheetId } = await ensureDisplaySheet({ spreadsheetUrl, serviceAccount });
  const rowStart = await nextDisplayStartRow({ spreadsheetUrl, serviceAccount });
  const rows = buildActBlankRows(act, actNo);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${q(DAILY_SHEET_NAME)}!A${rowStart}:${colLetter(BLANK_COLUMNS)}${rowStart + rows.length - 1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows }
  });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: blockFormatRequests(sheetId, rowStart, rows.length) }
  }).catch(() => {});
  return rowStart;
}

async function appendRegistryRow({ spreadsheetUrl, serviceAccount, act, actNo, rowStart }) {
  const { sheets, spreadsheetId } = await ensureRegistrySheet({ spreadsheetUrl, serviceAccount });
  const row = [
    actNo,
    act.sourceSheet || '',
    act.sourceRowNumber || '',
    act.sourceKey || '',
    'Хужат якунланди',
    rowStart,
    new Date().toISOString(),
    act.date || '',
    act.deviceName || '',
    act.serialNo || '',
    act.place || '',
    act.executor || '',
    act.a4Html || '',
    act.a4Json || ''
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${q(REGISTRY_SHEET_NAME)}!A:${colLetter(REGISTRY_HEADERS.length)}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

export async function writeActDocument({ spreadsheetUrl, serviceAccount, act }) {
  const existingRows = await getDailyReports({ spreadsheetUrl, serviceAccount });
  const sourceKey = String(act.sourceKey || '').trim();
  if (sourceKey) {
    const duplicate = existingRows.find(r => String(r.sourceKey || '').trim() === sourceKey);
    if (duplicate) {
      return { actNo: duplicate.actNo, duplicate: true, rowStart: duplicate.rowStart, reportSheetName: DAILY_SHEET_NAME, registrySheetName: REGISTRY_SHEET_NAME, message: 'Бу қатор учун ҳужжат аввал якунланган.' };
    }
  }
  const actNo = act.actNo || nextActNo(existingRows);
  const rowStart = await writeActBlankBlock({ spreadsheetUrl, serviceAccount, act, actNo });
  await appendRegistryRow({ spreadsheetUrl, serviceAccount, act, actNo, rowStart });
  return { actNo, duplicate: false, rowStart, reportSheetName: DAILY_SHEET_NAME, registrySheetName: REGISTRY_SHEET_NAME, message: 'Ҳужжат АКТЛАР_КУНЛИК варағига blank кўринишида сақланди.' };
}
