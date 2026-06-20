import { google } from 'googleapis';

const DAILY_SHEET_NAME = 'АКТЛАР_КУНЛИК';
const REGISTRY_SHEET_NAME = 'АКТЛАР_РЕЕСТР';
const REGISTRY_HEADERS = [
  'actNo',
  'sourceSheet',
  'sourceRowNumber',
  'sourceKey',
  'status',
  'rowStart',
  'createdAt',
  'date',
  'deviceName',
  'serialNo',
  'place',
  'executor',
  'a4Html',
  'a4Json'
];

export function extractSpreadsheetId(input = '') {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Google Sheets ҳаволаси киритилмаган');
  const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) || raw.match(/^([a-zA-Z0-9-_]{25,})$/);
  if (!m) throw new Error('Google Sheets ID аниқланмади');
  return m[1];
}

function normalizePrivateKey(key = '') {
  return String(key || '').replace(/\\n/g, '\n');
}

export function validateServiceAccount(serviceAccount) {
  const sa = serviceAccount;
  if (!sa || typeof sa !== 'object') throw new Error('SERVICE ACCOUNT JSON юкланмаган');
  if (sa.type && sa.type !== 'service_account') throw new Error('JSON type service_account эмас');
  if (!sa.client_email) throw new Error('client_email топилмади');
  if (!sa.private_key) throw new Error('private_key топилмади');
  if (!sa.project_id) throw new Error('project_id топилмади');
  return { ...sa, private_key: normalizePrivateKey(sa.private_key) };
}

export async function getSheetsClient(serviceAccount) {
  const sa = validateServiceAccount(serviceAccount);
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

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

function pad(row, cols = 8) {
  const out = Array(cols).fill('');
  row.forEach((v, i) => { if (i < cols) out[i] = v; });
  return out;
}

export async function listSheets({ spreadsheetUrl, serviceAccount }) {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  const sheets = await getSheetsClient(serviceAccount);
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return (res.data.sheets || []).map(s => s.properties?.title).filter(Boolean);
}

export async function ensureSheet({ spreadsheetUrl, serviceAccount, sheetName }) {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  const sheets = await getSheetsClient(serviceAccount);
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const found = (meta.data.sheets || []).find(s => s.properties?.title === sheetName);
  if (!found) {
    const add = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] }
    });
    return add.data.replies?.[0]?.addSheet?.properties?.sheetId;
  }
  return found.properties.sheetId;
}

export async function readSheetRows({ spreadsheetUrl, serviceAccount, sheetName, range = 'A:J' }) {
  if (!sheetName) throw new Error('ASOSIY VAROQ киритилмаган');
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  const sheets = await getSheetsClient(serviceAccount);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(sheetName)}!${range}`,
    valueRenderOption: 'FORMATTED_VALUE'
  });
  return res.data.values || [];
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
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 8 }, properties: { pixelSize: 118 }, fields: 'pixelSize' } },
        { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 0 } }, fields: 'gridProperties.frozenRowCount' } }
      ]
    }
  }).catch(() => {});
  return { sheets, spreadsheetId, sheetId };
}

async function nextDisplayStartRow({ spreadsheetUrl, serviceAccount }) {
  try {
    const rows = await readSheetRows({ spreadsheetUrl, serviceAccount, sheetName: DAILY_SHEET_NAME, range: 'A:H' });
    const last = rows.reduce((max, row, idx) => row.some(v => String(v || '').trim()) ? idx + 1 : max, 0);
    return last ? last + 4 : 1;
  } catch (_) {
    return 1;
  }
}

export async function countDailyReports({ spreadsheetUrl, serviceAccount }) {
  try {
    const reports = await getDailyReports({ spreadsheetUrl, serviceAccount });
    return reports.length;
  } catch (_) {
    return 0;
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
    pad(['', '', '', '', 'Низомга илова №4', '', '', '']),
    pad(['', '', '', '', '“SANEG” МЧЖ К/К объектларида', '', '', '']),
    pad(['', '', '', '', 'назорат ўлчов воситалари ва автоматлаштириш тизимларига', '', '', '']),
    pad(['', '', '', '', 'техник хизмат кўрсатиш бўйича', '', '', '']),
    pad(['', '', '', '', '', '', 'ТПП «Андижан»', '']),
    pad(['', '', '', '', '', '', '', '']),
    pad(['', '', 'ДАЛОЛАТНОМА №', actNo, '', '', '', '']),
    pad(['', '', 'Ўлчов воситасининг бузилиши', '', '', '', '', '']),
    pad(['', '', '', '', '', '', '', '']),
    pad(['Биз қуйида имзо чекувчилар:', '', '', '', '', '', '', '']),
    pad(['Ф.И.Ш.', act.person1 || '', 'Лавозими', act.position1 || '', 'Цех ва м/р', act.department1 || '', '', '']),
    pad(['Ф.И.Ш.', act.person2 || '', 'Лавозими', act.position2 || '', 'Цех ва м/р', act.department2 || '', '', '']),
    pad(['Ф.И.Ш.', act.person3 || '', 'Лавозими', act.position3 || '', 'Цех ва м/р', act.department3 || '', '', '']),
    pad(['1. Ў.В. Ишлаш жойи:', '', '', '', '', '', '', '']),
    pad([act.workPlace || '', '', '', '', '', '', '', '']),
    pad(['2. Рад этиш мазмуни, санаси, вақти:', '', '', '', '', '', 'Сана:', act.date || '']),
    pad([act.failureText || '', '', '', '', '', '', '', '']),
    pad(['3. Носозликнинг технологик оқибатлари:', '', '', '', '', '', '', '']),
    pad([act.impactText || '', '', '', '', '', '', '', '']),
    pad(['4. Рад этиш сабаби:', '', '', '', '', '', '', '']),
    pad([act.reasonText || '', '', '', '', '', '', '', '']),
    pad(['5. Носозликни бартараф этиш бўйича оператив ҳаракатлар ва бартараф этиш вақти:', '', '', '', '', '', '', '']),
    pad([act.actionText || '', '', '', '', '', '', '', '']),
    pad(['Хулоса:', '', '', '', '', '', '', '']),
    pad([act.conclusion || '', '', '', '', '', '', '', '']),
    pad(['Имзолар:', '', '', '', '', '', '', '']),
    pad(['', '_________________', '', '_________________', '', '_________________', '', '']),
    pad(['', '(Лавозими)', '', '(Имзо)', '', '(Ф.И.Ш.)', '', '']),
    pad(['', '_________________', '', '_________________', '', '_________________', '', '']),
    pad(['', '(Лавозими)', '', '(Имзо)', '', '(Ф.И.Ш.)', '', ''])
  ];
}

function blockFormatRequests(sheetId, startRow, rowCount) {
  const s = startRow - 1;
  const e = s + rowCount;
  const mergeRows = [0, 1, 2, 3, 6, 7, 9, 13, 14, 17, 18, 19, 20, 21, 22, 23, 24, 25];
  const requests = [];
  mergeRows.forEach(offset => {
    requests.push({ mergeCells: { range: { sheetId, startRowIndex: s + offset, endRowIndex: s + offset + 1, startColumnIndex: 0, endColumnIndex: 8 }, mergeType: 'MERGE_ALL' } });
  });
  requests.push(
    { repeatCell: { range: { sheetId, startRowIndex: s, endRowIndex: e, startColumnIndex: 0, endColumnIndex: 8 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', textFormat: { fontFamily: 'Times New Roman', fontSize: 11 }, borders: { top: { style: 'SOLID', width: 1 }, bottom: { style: 'SOLID', width: 1 }, left: { style: 'SOLID', width: 1 }, right: { style: 'SOLID', width: 1 } } } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment,textFormat,borders)' } },
    { repeatCell: { range: { sheetId, startRowIndex: s, endRowIndex: s + 8, startColumnIndex: 0, endColumnIndex: 8 }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true, fontFamily: 'Times New Roman', fontSize: 12 } } }, fields: 'userEnteredFormat(horizontalAlignment,textFormat)' } },
    { repeatCell: { range: { sheetId, startRowIndex: s + 9, endRowIndex: s + 26, startColumnIndex: 0, endColumnIndex: 8 }, cell: { userEnteredFormat: { horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat(horizontalAlignment)' } },
    { repeatCell: { range: { sheetId, startRowIndex: s + 26, endRowIndex: s + 30, startColumnIndex: 0, endColumnIndex: 8 }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { fontSize: 10, fontFamily: 'Times New Roman' } } }, fields: 'userEnteredFormat(horizontalAlignment,textFormat)' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: s, endIndex: e }, properties: { pixelSize: 32 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: s + 14, endIndex: s + 25 }, properties: { pixelSize: 54 }, fields: 'pixelSize' } }
  );
  return requests;
}

async function writeActBlankBlock({ spreadsheetUrl, serviceAccount, act, actNo }) {
  const { sheets, spreadsheetId, sheetId } = await ensureDisplaySheet({ spreadsheetUrl, serviceAccount });
  const rowStart = await nextDisplayStartRow({ spreadsheetUrl, serviceAccount });
  const rows = buildActBlankRows(act, actNo);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${q(DAILY_SHEET_NAME)}!A${rowStart}:H${rowStart + rows.length - 1}`,
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
      return {
        actNo: duplicate.actNo,
        duplicate: true,
        rowStart: duplicate.rowStart,
        reportSheetName: DAILY_SHEET_NAME,
        registrySheetName: REGISTRY_SHEET_NAME,
        message: 'Бу қатор учун ҳужжат аввал якунланган.'
      };
    }
  }
  const actNo = act.actNo || nextActNo(existingRows);
  const rowStart = await writeActBlankBlock({ spreadsheetUrl, serviceAccount, act, actNo });
  await appendRegistryRow({ spreadsheetUrl, serviceAccount, act, actNo, rowStart });
  return {
    actNo,
    duplicate: false,
    rowStart,
    reportSheetName: DAILY_SHEET_NAME,
    registrySheetName: REGISTRY_SHEET_NAME,
    message: 'Ҳужжат АКТЛАР_КУНЛИК варағига blank кўринишида сақланди.'
  };
}
