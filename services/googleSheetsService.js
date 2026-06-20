import { google } from 'googleapis';

const DAILY_SHEET_NAME = 'АКТЛАР_КУНЛИК';
const DAILY_HEADERS = [
  'Акт рақами',
  'Сана',
  'Асбоб номи',
  'Завод рақами',
  'Жой',
  'Ижрочи',
  'Ҳолат',
  '1. Ў.В. Ишлаш жойи',
  '2. Рад этиш мазмуни, санаси, вақти',
  '3. Носозликнинг технологик оқибатлари',
  '4. Рад этиш сабаби',
  '5. Бартараф этиш чоралари',
  'Хулоса',
  'Ф.И.Ш. 1',
  'Лавозими 1',
  'Цех ва м/р 1',
  'Ф.И.Ш. 2',
  'Лавозими 2',
  'Цех ва м/р 2',
  'Ф.И.Ш. 3',
  'Лавозими 3',
  'Цех ва м/р 3',
  'Яратилган вақт',
  'Source Sheet',
  'Source Row Number',
  'Source Key',
  'A4 HTML',
  'A4 JSON'
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

async function ensureDailySheet({ spreadsheetUrl, serviceAccount }) {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  const sheets = await getSheetsClient(serviceAccount);
  const sheetId = await ensureSheet({ spreadsheetUrl, serviceAccount, sheetName: DAILY_SHEET_NAME });
  const lastCol = colLetter(DAILY_HEADERS.length);
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(DAILY_SHEET_NAME)}!A1:${lastCol}1`
  }).catch(() => ({ data: { values: [] } }));
  const header = current.data.values?.[0] || [];
  const headerNeedsUpdate = DAILY_HEADERS.some((h, i) => String(header[i] || '').trim() !== h);
  if (headerNeedsUpdate) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${q(DAILY_SHEET_NAME)}!A1:${lastCol}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [DAILY_HEADERS] }
    });
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: 'CENTER', backgroundColor: { red: 0.05, green: 0.22, blue: 0.30 } } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,backgroundColor)' } },
          { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
          { autoResizeDimensions: { dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: DAILY_HEADERS.length } } }
        ]
      }
    }).catch(() => {});
  }
  return { sheets, spreadsheetId, sheetId };
}

export async function countDailyReports({ spreadsheetUrl, serviceAccount }) {
  try {
    const rows = await readSheetRows({ spreadsheetUrl, serviceAccount, sheetName: DAILY_SHEET_NAME, range: `A:${colLetter(DAILY_HEADERS.length)}` });
    return Math.max(0, rows.filter(r => r && r.some(c => String(c || '').trim())).length - 1);
  } catch (_) {
    return 0;
  }
}

export async function getDailyReports({ spreadsheetUrl, serviceAccount }) {
  try {
    await ensureDailySheet({ spreadsheetUrl, serviceAccount });
    const rows = await readSheetRows({ spreadsheetUrl, serviceAccount, sheetName: DAILY_SHEET_NAME, range: `A:${colLetter(DAILY_HEADERS.length)}` });
    return rows.slice(1).filter(r => r.some(c => String(c || '').trim())).map((r, idx) => ({
      no: idx + 1,
      actNo: r[0] || '',
      date: r[1] || '',
      device: r[2] || '',
      serial: r[3] || '',
      place: r[4] || '',
      executor: r[5] || '',
      status: r[6] || '',
      workPlace: r[7] || '',
      failureText: r[8] || '',
      impactText: r[9] || '',
      reasonText: r[10] || '',
      actionText: r[11] || '',
      conclusion: r[12] || '',
      createdAt: r[22] || '',
      sourceSheet: r[23] || '',
      sourceRowNumber: r[24] || '',
      sourceKey: r[25] || '',
      a4Html: r[26] || '',
      a4Json: r[27] || '',
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

export async function writeActDocument({ spreadsheetUrl, serviceAccount, act }) {
  const { sheets, spreadsheetId } = await ensureDailySheet({ spreadsheetUrl, serviceAccount });
  const existingRows = await getDailyReports({ spreadsheetUrl, serviceAccount });
  const sourceKey = String(act.sourceKey || '').trim();
  if (sourceKey) {
    const duplicate = existingRows.find(r => String(r.sourceKey || '').trim() === sourceKey);
    if (duplicate) {
      return {
        actNo: duplicate.actNo,
        duplicate: true,
        reportSheetName: DAILY_SHEET_NAME,
        message: 'Бу қатор учун ҳужжат аввал якунланган.'
      };
    }
  }
  const actNo = act.actNo || nextActNo(existingRows);
  const row = [
    actNo,
    act.date || '',
    act.deviceName || '',
    act.serialNo || '',
    act.place || '',
    act.executor || '',
    'Хужат якунланди',
    act.workPlace || '',
    act.failureText || '',
    act.impactText || '',
    act.reasonText || '',
    act.actionText || '',
    act.conclusion || '',
    act.person1 || '',
    act.position1 || '',
    act.department1 || '',
    act.person2 || '',
    act.position2 || '',
    act.department2 || '',
    act.person3 || '',
    act.position3 || '',
    act.department3 || '',
    new Date().toISOString(),
    act.sourceSheet || '',
    act.sourceRowNumber || '',
    sourceKey,
    act.a4Html || '',
    act.a4Json || ''
  ];
  const lastCol = colLetter(DAILY_HEADERS.length);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${q(DAILY_SHEET_NAME)}!A:${lastCol}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
  return { actNo, duplicate: false, reportSheetName: DAILY_SHEET_NAME, message: 'Ҳужжат АКТЛАР_КУНЛИК варағига янги қатор сифатида сақланди.' };
}
