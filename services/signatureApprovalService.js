import crypto from 'crypto';
import { Readable } from 'stream';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import {
  ensureSheet,
  extractSpreadsheetId,
  getSheetsClient,
  validateServiceAccount,
} from './googleSheetsService.js';

const SIGNERS_SHEET = 'ИМЗО_ЧЕКУВЧИЛАР';
const APPROVALS_SHEET = 'ҲУЖЖАТ_ТАСДИҚЛАШ';
const AUDIT_SHEET = 'АУДИТ_ЛОГ';
const REGISTRY_SHEET = 'АКТЛАР_РЕЕСТР';
const DAILY_SHEET = 'АКТЛАР_КУНЛИК';

const SIGNER_HEADERS = ['ID', 'Lavozimi', 'FIO', 'ImzoPNG', 'Gmail', 'CreatedAt'];
const APPROVAL_HEADERS = [
  'ID', 'ActNo', 'SignerID', 'Lavozimi', 'FIO', 'Gmail', 'Status', 'ApprovalLink',
  'TokenHash', 'CreatedAt', 'OpenedAt', 'ApprovedAt', 'IP', 'UserAgent', 'SignatureFileId',
];
const AUDIT_HEADERS = [
  'ID', 'Action', 'Actor', 'ActNo', 'SignerID', 'Gmail', 'DateTime', 'IP', 'UserAgent', 'Details',
];

function q(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

function colLetter(n) {
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function nowIso() {
  return new Date().toISOString();
}

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

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

export function parseConfigHeader(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8')) || {};
  } catch (_) {
    throw new Error('x-seg-kip-config формати нотўғри');
  }
}

function parseEnvServiceAccount() {
  const raw = clean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_BASE64);
  if (!raw) return null;
  const direct = safeJsonParse(raw);
  if (direct) return direct;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch (_) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON / BASE64 парсинг хатоси');
  }
}

export function resolveGoogleConfig(input = {}, { requireServer = false } = {}) {
  const envAccount = parseEnvServiceAccount();
  const envSheet = clean(process.env.GOOGLE_SPREADSHEET_URL || process.env.GOOGLE_SPREADSHEET_ID);
  const config = {
    spreadsheetUrl: envSheet || clean(input.spreadsheetUrl || input.spreadsheetId),
    serviceAccount: envAccount || input.serviceAccount,
  };
  if (requireServer && (!envAccount || !envSheet)) {
    throw new Error('Railway Variables да GOOGLE_SERVICE_ACCOUNT_JSON ва GOOGLE_SPREADSHEET_URL киритилиши шарт');
  }
  if (!config.spreadsheetUrl) throw new Error('Google Sheets ҳаволаси киритилмаган');
  config.serviceAccount = validateServiceAccount(config.serviceAccount);
  return config;
}

async function ensureTable(config, sheetName, headers) {
  const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);
  const sheets = await getSheetsClient(config.serviceAccount);
  const sheetId = await ensureSheet({ ...config, sheetName });
  const lastCol = colLetter(headers.length);
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(sheetName)}!A1:${lastCol}1`,
  }).catch(() => ({ data: { values: [] } }));
  const row = current.data.values?.[0] || [];
  const mismatch = headers.some((header, i) => clean(row[i]) !== header);
  if (mismatch) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${q(sheetName)}!A1:${lastCol}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  backgroundColor: { red: 0.047, green: 0.22, blue: 0.298 },
                  horizontalAlignment: 'CENTER',
                },
              },
              fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)',
            },
          },
          {
            autoResizeDimensions: {
              dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: headers.length },
            },
          },
        ],
      },
    }).catch(() => {});
  }
  return { sheets, spreadsheetId, sheetId };
}

async function readTable(config, sheetName, headers) {
  const { sheets, spreadsheetId } = await ensureTable(config, sheetName, headers);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(sheetName)}!A:${colLetter(headers.length)}`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  return (result.data.values || []).slice(1).map((row, index) => ({ row, rowNumber: index + 2 }));
}

function signerFromRow(item) {
  const r = item.row;
  return {
    id: r[0] || '',
    position: r[1] || '',
    fio: r[2] || '',
    signatureUrl: r[3] || '',
    gmail: r[4] || '',
    createdAt: r[5] || '',
    rowNumber: item.rowNumber,
  };
}

function validateGmail(value) {
  const email = clean(value).toLowerCase();
  if (!/^[^\s@]+@gmail\.com$/i.test(email)) throw new Error('Фақат тўғри Gmail манзили қабул қилинади');
  return email;
}

function validateSigner(input, { partial = false } = {}) {
  const out = {
    position: clean(input.position || input.lavozimi),
    fio: clean(input.fio || input.FIO),
    signatureUrl: clean(input.signatureUrl || input.imzoPNG),
    gmail: clean(input.gmail),
  };
  if (!partial || out.position) {
    if (!out.position) throw new Error('Лавозими киритилиши шарт');
  }
  if (!partial || out.fio) {
    if (!out.fio) throw new Error('F.I.O киритилиши шарт');
  }
  if (!partial || out.signatureUrl) {
    if (!out.signatureUrl) throw new Error('PNG имзо юкланиши шарт');
  }
  if (!partial || out.gmail) out.gmail = validateGmail(out.gmail);
  return out;
}

export async function listSigners(configInput) {
  const config = resolveGoogleConfig(configInput);
  const rows = await readTable(config, SIGNERS_SHEET, SIGNER_HEADERS);
  return rows.map(signerFromRow).filter((s) => s.id);
}

export async function createSigner(configInput, input, auditContext = {}) {
  const config = resolveGoogleConfig(configInput);
  const signer = validateSigner(input);
  const { sheets, spreadsheetId } = await ensureTable(config, SIGNERS_SHEET, SIGNER_HEADERS);
  const id = randomId('SGN');
  const createdAt = nowIso();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${q(SIGNERS_SHEET)}!A:F`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[id, signer.position, signer.fio, signer.signatureUrl, signer.gmail, createdAt]] },
  });
  await appendAudit(config, { ...auditContext, action: 'SIGNER_CREATED', signerId: id, gmail: signer.gmail, actor: auditContext.actor || 'Administrator', details: signer.fio });
  return { id, ...signer, createdAt };
}

async function findSigner(config, id) {
  const rows = await readTable(config, SIGNERS_SHEET, SIGNER_HEADERS);
  const found = rows.map(signerFromRow).find((s) => s.id === id);
  if (!found) throw new Error('Имзо чекувчи топилмади');
  return found;
}

export async function updateSigner(configInput, id, input, auditContext = {}) {
  const config = resolveGoogleConfig(configInput);
  const current = await findSigner(config, id);
  const patch = validateSigner(input, { partial: true });
  const next = {
    position: patch.position || current.position,
    fio: patch.fio || current.fio,
    signatureUrl: patch.signatureUrl || current.signatureUrl,
    gmail: patch.gmail || current.gmail,
  };
  validateSigner(next);
  const { sheets, spreadsheetId } = await ensureTable(config, SIGNERS_SHEET, SIGNER_HEADERS);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${q(SIGNERS_SHEET)}!A${current.rowNumber}:F${current.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[id, next.position, next.fio, next.signatureUrl, next.gmail, current.createdAt || nowIso()]] },
  });
  await appendAudit(config, { ...auditContext, action: 'SIGNER_UPDATED', signerId: id, gmail: next.gmail, actor: auditContext.actor || 'Administrator', details: next.fio });
  return { id, ...next, createdAt: current.createdAt };
}

export async function deleteSigner(configInput, id, auditContext = {}) {
  const config = resolveGoogleConfig(configInput);
  const current = await findSigner(config, id);
  const { sheets, spreadsheetId, sheetId } = await ensureTable(config, SIGNERS_SHEET, SIGNER_HEADERS);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: current.rowNumber - 1,
            endIndex: current.rowNumber,
          },
        },
      }],
    },
  });
  await appendAudit(config, { ...auditContext, action: 'SIGNER_DELETED', signerId: id, gmail: current.gmail, actor: auditContext.actor || 'Administrator', details: current.fio });
  return { deleted: true, id };
}

function driveAuth(serviceAccount) {
  const sa = validateServiceAccount(serviceAccount);
  return new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

export async function uploadSignaturePng(configInput, file, auditContext = {}) {
  if (!file?.buffer) throw new Error('PNG файл танланмаган');
  const isPng = file.mimetype === 'image/png' && file.buffer.length >= 8 && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!isPng) throw new Error('Фақат ҳақиқий PNG файл қабул қилинади');
  if (file.size > 2 * 1024 * 1024) throw new Error('PNG ҳажми 2 MB дан ошмаслиги керак');
  const config = resolveGoogleConfig(configInput);
  const folderId = clean(process.env.SIGNATURE_DRIVE_FOLDER_ID);
  if (!folderId) throw new Error('Railway Variables да SIGNATURE_DRIVE_FOLDER_ID киритилиши шарт');
  const auth = driveAuth(config.serviceAccount);
  await auth.authorize();
  const drive = google.drive({ version: 'v3', auth });
  const name = `SEG-KIP-signature-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`;
  const result = await drive.files.create({
    requestBody: { name, mimeType: 'image/png', parents: [folderId] },
    media: { mimeType: 'image/png', body: Readable.from(file.buffer) },
    fields: 'id,name,mimeType,webViewLink,parents',
  });
  const fileId = result.data.id;
  const webViewLink = result.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
  await appendAudit(config, { ...auditContext, action: 'SIGNATURE_UPLOADED', actor: auditContext.actor || 'Administrator', details: `${name}|${fileId}` });
  return { fileId, name, webViewLink };
}

function extractDriveFileId(value) {
  const raw = clean(value);
  return raw.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]
    || raw.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1]
    || (raw.match(/^[a-zA-Z0-9_-]{20,}$/)?.[0] || '');
}

async function getRegistryDocument(config, actNo) {
  const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);
  const sheets = await getSheetsClient(config.serviceAccount);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(REGISTRY_SHEET)}!A:N`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const rows = result.data.values || [];
  const index = rows.findIndex((row, i) => i > 0 && clean(row[0]) === clean(actNo));
  if (index < 0) throw new Error('Ҳужжат АКТЛАР_РЕЕСТР дан топилмади');
  const r = rows[index];
  return {
    rowNumber: index + 1,
    actNo: r[0] || '',
    status: r[4] || '',
    rowStart: Number(r[5]) || 0,
    date: r[7] || '',
    deviceName: r[8] || '',
    serialNo: r[9] || '',
    place: r[10] || '',
    executor: r[11] || '',
    a4Html: r[12] || '',
    a4Json: r[13] || '',
  };
}

function approvalFromRow(item) {
  const r = item.row;
  return {
    id: r[0] || '', actNo: r[1] || '', signerId: r[2] || '', position: r[3] || '',
    fio: r[4] || '', gmail: r[5] || '', status: r[6] || '', approvalLink: r[7] || '',
    tokenHash: r[8] || '', createdAt: r[9] || '', openedAt: r[10] || '', approvedAt: r[11] || '',
    ip: r[12] || '', userAgent: r[13] || '', signatureFileId: r[14] || '', rowNumber: item.rowNumber,
  };
}

async function listApprovals(config, actNo = '') {
  const rows = await readTable(config, APPROVALS_SHEET, APPROVAL_HEADERS);
  return rows.map(approvalFromRow).filter((a) => a.id && (!actNo || a.actNo === actNo));
}

function jwtSecret() {
  const secret = clean(process.env.APPROVAL_JWT_SECRET);
  if (!secret || secret.length < 32) throw new Error('APPROVAL_JWT_SECRET камида 32 белгидан иборат бўлиши шарт');
  return secret;
}

function signApprovalToken(payload) {
  return jwt.sign({ ...payload, type: 'approval' }, jwtSecret(), {
    expiresIn: process.env.APPROVAL_TOKEN_TTL || '7d',
    issuer: 'SEG-KIP-AI',
    audience: 'document-approval',
    jwtid: crypto.randomUUID(),
  });
}

export function verifyApprovalToken(token) {
  const payload = jwt.verify(token, jwtSecret(), { issuer: 'SEG-KIP-AI', audience: 'document-approval' });
  if (payload.type !== 'approval') throw new Error('Тасдиқлаш токени нотўғри');
  return payload;
}

export function createCsrfToken(approvalId, approvalToken) {
  return jwt.sign({ type: 'csrf', approvalId, approvalHash: sha256(approvalToken) }, jwtSecret(), {
    expiresIn: '30m', issuer: 'SEG-KIP-AI', audience: 'approval-csrf',
  });
}

export function verifyCsrfToken(csrfToken, approvalId, approvalToken) {
  const payload = jwt.verify(csrfToken, jwtSecret(), { issuer: 'SEG-KIP-AI', audience: 'approval-csrf' });
  if (payload.type !== 'csrf' || payload.approvalId !== approvalId || payload.approvalHash !== sha256(approvalToken)) {
    throw new Error('CSRF токени нотўғри');
  }
}

function createSignatureImageToken(fileId) {
  return jwt.sign({ type: 'signature-image', fileId }, jwtSecret(), {
    expiresIn: process.env.SIGNATURE_IMAGE_TOKEN_TTL || '365d',
    issuer: 'SEG-KIP-AI',
    audience: 'signature-image',
  });
}

export function verifySignatureImageToken(token) {
  const payload = jwt.verify(token, jwtSecret(), { issuer: 'SEG-KIP-AI', audience: 'signature-image' });
  if (payload.type !== 'signature-image' || !payload.fileId) throw new Error('Имзо расми токени нотўғри');
  return payload;
}

function baseUrlFromRequest(req) {
  const configured = clean(process.env.PUBLIC_BASE_URL).replace(/\/$/, '');
  if (configured) return configured;
  const proto = clean(req.headers['x-forwarded-proto']).split(',')[0] || req.protocol || 'https';
  const host = req.get('host');
  return `${proto}://${host}`;
}

function transportConfig() {
  const user = clean(process.env.SMTP_USER || process.env.GMAIL_USER);
  const pass = clean(process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD);
  const host = clean(process.env.SMTP_HOST) || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  if (!user || !pass) throw new Error('SMTP_USER ва SMTP_PASS (ёки GMAIL_USER/GMAIL_APP_PASSWORD) киритилиши шарт');
  return {
    transporter: nodemailer.createTransport({ host, port, secure: String(process.env.SMTP_SECURE ?? (port === 465)) !== 'false', auth: { user, pass } }),
    from: clean(process.env.SMTP_FROM) || user,
  };
}

async function upsertApproval(config, approval) {
  const existing = (await listApprovals(config, approval.actNo)).find((a) => a.signerId === approval.signerId);
  const { sheets, spreadsheetId } = await ensureTable(config, APPROVALS_SHEET, APPROVAL_HEADERS);
  const row = [
    approval.id, approval.actNo, approval.signerId, approval.position, approval.fio, approval.gmail,
    approval.status, approval.approvalLink, approval.tokenHash, approval.createdAt, approval.openedAt || '',
    approval.approvedAt || '', approval.ip || '', approval.userAgent || '', approval.signatureFileId || '',
  ];
  if (existing) {
    approval.id = existing.id;
    row[0] = existing.id;
    row[10] = existing.openedAt || approval.openedAt || '';
    row[11] = existing.approvedAt || approval.approvedAt || '';
    if (existing.status === 'Тасдиқланди') row[6] = existing.status;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${q(APPROVALS_SHEET)}!A${existing.rowNumber}:O${existing.rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });
    return { ...approval, id: existing.id, status: row[6], openedAt: row[10], approvedAt: row[11], rowNumber: existing.rowNumber };
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${q(APPROVALS_SHEET)}!A:O`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
  return approval;
}

async function updateApprovalRow(config, approval) {
  const { sheets, spreadsheetId } = await ensureTable(config, APPROVALS_SHEET, APPROVAL_HEADERS);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${q(APPROVALS_SHEET)}!A${approval.rowNumber}:O${approval.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[
      approval.id, approval.actNo, approval.signerId, approval.position, approval.fio, approval.gmail,
      approval.status, approval.approvalLink, approval.tokenHash, approval.createdAt, approval.openedAt || '',
      approval.approvedAt || '', approval.ip || '', approval.userAgent || '', approval.signatureFileId || '',
    ]] },
  });
}

function signerSectionHtml(approvals, baseUrl) {
  const cards = approvals.map((a) => {
    const approved = a.status === 'Тасдиқланди';
    const image = approved && a.signatureFileId
      ? `<img alt="Имзо" src="${baseUrl}/api/signature/render/${createSignatureImageToken(a.signatureFileId)}" style="max-width:180px;max-height:70px;object-fit:contain">`
      : `<div style="height:70px;display:grid;place-items:center;color:#64748b">${approved ? 'Имзо файли йўқ' : 'Кутилмоқда'}</div>`;
    return `<div style="border:1px solid #cbd5e1;border-radius:8px;padding:10px;text-align:center;min-height:150px"><div style="font-weight:700">${escapeHtml(a.position)}</div>${image}<div style="border-top:1px solid #111;padding-top:6px">${escapeHtml(a.fio)}</div><small>${escapeHtml(a.status)}${a.approvedAt ? ` · ${escapeHtml(a.approvedAt)}` : ''}</small></div>`;
  }).join('');
  return `<!--SEG_APPROVALS_START--><div style="margin-top:24px"><p><b>Электрон тасдиқловчилар:</b></p><div style="display:grid;grid-template-columns:repeat(${Math.min(3, Math.max(1, approvals.length))},1fr);gap:16px">${cards}</div></div><!--SEG_APPROVALS_END-->`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function injectSignerSection(html, section) {
  let source = clean(html) || '<div class="a4-preview"><p>Ҳужжат маълумоти мавжуд эмас.</p></div>';
  source = source.replace(/<!--SEG_APPROVALS_START-->[\s\S]*?<!--SEG_APPROVALS_END-->/g, '');
  const last = source.lastIndexOf('</div>');
  return last >= 0 ? `${source.slice(0, last)}${section}${source.slice(last)}` : `${source}${section}`;
}

async function updateDocumentState(config, document, approvals, baseUrl) {
  const total = approvals.length;
  const approved = approvals.filter((a) => a.status === 'Тасдиқланди').length;
  const status = total > 0 && approved === total ? 'Тасдиқланди' : approved > 0 ? 'Қисман тасдиқланди' : 'Кутилмоқда';
  const updatedHtml = injectSignerSection(document.a4Html, signerSectionHtml(approvals, baseUrl));
  const json = safeJsonParse(document.a4Json, {}) || {};
  json.approvals = approvals.map((a) => ({ signerId: a.signerId, position: a.position, fio: a.fio, gmail: a.gmail, status: a.status, approvedAt: a.approvedAt || '' }));
  const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);
  const sheets = await getSheetsClient(config.serviceAccount);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    valueInputOption: 'RAW',
    requestBody: {
      data: [
        { range: `${q(REGISTRY_SHEET)}!E${document.rowNumber}`, values: [[status]] },
        { range: `${q(REGISTRY_SHEET)}!M${document.rowNumber}:N${document.rowNumber}`, values: [[updatedHtml, JSON.stringify(json)]] },
      ],
    },
  });
  if (document.rowStart) {
    const signerNames = approvals.map((a) => a.fio).join(', ');
    const gmails = approvals.map((a) => a.gmail).join(', ');
    const links = approvals.map((a) => a.approvalLink).join('\n');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${q(DAILY_SHEET)}!K${document.rowStart}:O${document.rowStart + 1}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          ['Status', 'Imzolovchi', 'Gmail', 'ApprovalLink', 'CreatedDate'],
          [status, signerNames, gmails, links, nowIso()],
        ],
      },
    }).catch(() => {});
  }
  return { status, updatedHtml, approved, total };
}

export async function sendDocumentForApproval(configInput, input, req) {
  const config = resolveGoogleConfig(configInput, { requireServer: true });
  const actNo = clean(input.actNo);
  if (!actNo) throw new Error('Акт рақами киритилмаган');
  const document = await getRegistryDocument(config, actNo);
  const signers = await listSigners(config);
  if (!signers.length) throw new Error('ИМЗО_ЧЕКУВЧИЛАР варағида имзоловчилар йўқ');
  const baseUrl = baseUrlFromRequest(req);
  const { transporter, from } = transportConfig();
  const results = [];
  for (const signer of signers) {
    const approvalId = randomId('APR');
    const token = signApprovalToken({ approvalId, actNo, signerId: signer.id, email: signer.gmail });
    const link = `${baseUrl}/api/document/approve/${encodeURIComponent(token)}`;
    const approval = await upsertApproval(config, {
      id: approvalId,
      actNo,
      signerId: signer.id,
      position: signer.position,
      fio: signer.fio,
      gmail: signer.gmail,
      status: 'Кутилмоқда',
      approvalLink: link,
      tokenHash: sha256(token),
      createdAt: nowIso(),
      signatureFileId: extractDriveFileId(signer.signatureUrl),
    });
    if (approval.status === 'Тасдиқланди') {
      results.push({ signer: signer.fio, gmail: signer.gmail, status: 'already-approved' });
      continue;
    }
    try {
      await transporter.sendMail({
        from,
        to: signer.gmail,
        subject: 'Hujjatni tasdiqlash talab qilinadi',
        text: `Hujjat: ${actNo}\nTasdiqlash havolasi: ${link}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><h2>Hujjatni tasdiqlash talab qilinadi</h2><p><b>Hujjat nomi:</b> ${escapeHtml(actNo)}</p><p><b>Imzolovchi:</b> ${escapeHtml(signer.fio)}</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#0891b2;color:#fff;text-decoration:none;border-radius:8px">Hujjatni ochish va tasdiqlash</a></p><p style="color:#64748b">Havola shaxsiy va boshqa hujjatlarni ko‘rsatmaydi.</p></div>`,
      });
      results.push({ signer: signer.fio, gmail: signer.gmail, status: 'sent' });
      await appendAudit(config, { action: 'DOCUMENT_SENT', actor: clean(input.sentBy) || 'Administrator', actNo, signerId: signer.id, gmail: signer.gmail, ip: req.ip, userAgent: req.get('user-agent'), details: link });
    } catch (error) {
      results.push({ signer: signer.fio, gmail: signer.gmail, status: 'email-failed', error: error.message });
      await appendAudit(config, { action: 'EMAIL_FAILED', actor: clean(input.sentBy) || 'Administrator', actNo, signerId: signer.id, gmail: signer.gmail, ip: req.ip, userAgent: req.get('user-agent'), details: error.message });
    }
  }
  const approvals = await listApprovals(config, actNo);
  const state = await updateDocumentState(config, document, approvals, baseUrl);
  return { actNo, results, ...state };
}

async function findApprovalByToken(config, token) {
  const payload = verifyApprovalToken(token);
  const approvals = await listApprovals(config, payload.actNo);
  const approval = approvals.find((a) => a.id === payload.approvalId && a.signerId === payload.signerId && a.gmail.toLowerCase() === String(payload.email).toLowerCase());
  if (!approval || approval.tokenHash !== sha256(token)) throw new Error('Тасдиқлаш ҳаволаси бекор қилинган ёки янгиланган');
  return { payload, approval };
}

export async function openApproval(token, req) {
  const config = resolveGoogleConfig({}, { requireServer: true });
  const { approval } = await findApprovalByToken(config, token);
  const document = await getRegistryDocument(config, approval.actNo);
  if (!approval.openedAt) {
    approval.openedAt = nowIso();
    approval.ip = req.ip || '';
    approval.userAgent = req.get('user-agent') || '';
    await updateApprovalRow(config, approval);
  }
  await appendAudit(config, { action: 'DOCUMENT_OPENED', actor: approval.fio, actNo: approval.actNo, signerId: approval.signerId, gmail: approval.gmail, ip: req.ip, userAgent: req.get('user-agent') });
  return { approval, document, csrfToken: createCsrfToken(approval.id, token) };
}

export async function approveDocument(token, csrfToken, req) {
  const config = resolveGoogleConfig({}, { requireServer: true });
  const { approval } = await findApprovalByToken(config, token);
  verifyCsrfToken(csrfToken, approval.id, token);
  if (approval.status !== 'Тасдиқланди') {
    approval.status = 'Тасдиқланди';
    approval.approvedAt = nowIso();
    approval.ip = req.ip || approval.ip || '';
    approval.userAgent = req.get('user-agent') || approval.userAgent || '';
    await updateApprovalRow(config, approval);
    await appendAudit(config, { action: 'DOCUMENT_APPROVED', actor: approval.fio, actNo: approval.actNo, signerId: approval.signerId, gmail: approval.gmail, ip: req.ip, userAgent: req.get('user-agent') });
  }
  const document = await getRegistryDocument(config, approval.actNo);
  const approvals = await listApprovals(config, approval.actNo);
  const state = await updateDocumentState(config, document, approvals, baseUrlFromRequest(req));
  return { approval, ...state };
}

export async function streamSignatureImage(token, res) {
  const { fileId } = verifySignatureImageToken(token);
  const config = resolveGoogleConfig({}, { requireServer: true });
  const auth = driveAuth(config.serviceAccount);
  await auth.authorize();
  const drive = google.drive({ version: 'v3', auth });
  const meta = await drive.files.get({ fileId, fields: 'mimeType,name,size' });
  if (meta.data.mimeType !== 'image/png') throw new Error('Имзо файли PNG эмас');
  const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  response.data.pipe(res);
}

export async function appendAudit(configInput, input) {
  const config = resolveGoogleConfig(configInput);
  const { sheets, spreadsheetId } = await ensureTable(config, AUDIT_SHEET, AUDIT_HEADERS);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${q(AUDIT_SHEET)}!A:J`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[
      randomId('AUD'), clean(input.action), clean(input.actor), clean(input.actNo), clean(input.signerId),
      clean(input.gmail), nowIso(), clean(input.ip), clean(input.userAgent), clean(input.details),
    ]] },
  });
}

export async function getAudit(configInput, limit = 200) {
  const config = resolveGoogleConfig(configInput);
  const rows = await readTable(config, AUDIT_SHEET, AUDIT_HEADERS);
  return rows.slice(-Math.max(1, Math.min(Number(limit) || 200, 1000))).reverse().map((item) => {
    const r = item.row;
    return { id: r[0] || '', action: r[1] || '', actor: r[2] || '', actNo: r[3] || '', signerId: r[4] || '', gmail: r[5] || '', dateTime: r[6] || '', ip: r[7] || '', userAgent: r[8] || '', details: r[9] || '' };
  });
}

export function renderApprovalPage({ approval, document, csrfToken }, token) {
  const isApproved = approval.status === 'Тасдиқланди';
  const safeHtml = document.a4Html || `<div class="paper"><h2>${escapeHtml(document.actNo)}</h2><p>${escapeHtml(document.deviceName)} · ${escapeHtml(document.serialNo)}</p></div>`;
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(document.actNo)} — Tasdiqlash</title><style>body{margin:0;background:#071427;color:#eaf7ff;font-family:Arial,sans-serif}.wrap{max-width:980px;margin:0 auto;padding:20px}.head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.badge{padding:8px 12px;border-radius:999px;background:${isApproved ? '#166534' : '#92400e'}}.paper{background:#fff;color:#111;padding:24px;margin:18px 0;border-radius:12px;overflow:auto}.a4-preview{max-width:210mm;min-height:297mm;margin:auto;background:#fff;color:#111;padding:18mm;box-sizing:border-box;font-family:'Times New Roman',serif}.actions{display:flex;justify-content:center;margin:20px}.approve{border:0;border-radius:10px;padding:14px 24px;font-size:17px;font-weight:800;background:#22c55e;color:#052e16;cursor:pointer}.approve:disabled{opacity:.55}.msg{text-align:center;min-height:24px}</style></head><body><div class="wrap"><div class="head"><div><h1>Hujjatni tasdiqlash</h1><p>${escapeHtml(approval.position)} — ${escapeHtml(approval.fio)}</p></div><div class="badge" id="status">${escapeHtml(approval.status)}</div></div><div class="paper">${safeHtml}</div><div class="actions"><button class="approve" id="approveBtn" ${isApproved ? 'disabled' : ''}>${isApproved ? 'Tasdiqlangan' : 'Tasdiqlash'}</button></div><div class="msg" id="msg"></div></div><script>const token=${JSON.stringify(token)};const csrfToken=${JSON.stringify(csrfToken)};document.getElementById('approveBtn').addEventListener('click',async()=>{const b=document.getElementById('approveBtn');b.disabled=true;document.getElementById('msg').textContent='Tasdiqlanmoqda...';try{const r=await fetch('/api/document/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,csrfToken})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Xato');document.getElementById('status').textContent='Тасдиқланди';b.textContent='Tasdiqlangan';document.getElementById('msg').textContent='Hujjat muvaffaqiyatli tasdiqlandi.';}catch(e){b.disabled=false;document.getElementById('msg').textContent=e.message;}});</script></body></html>`;
}
