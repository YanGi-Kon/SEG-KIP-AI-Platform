import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ensureSheet, extractSpreadsheetId, getSheetsClient } from './googleSheetsService.js';
import { resolveWorkspaceGoogleConfig } from './workspaceGoogleService.js';
import { sendDocumentForApproval } from './signatureApprovalService.js';
import { hasHttpEmailProvider, sendHttpEmail } from './httpEmailService.js';
import { listWorkspaceSigners } from '../repositories/workspaceSignerRepository.js';

const SIGNERS_SHEET = 'ИМЗО_ЧЕКУВЧИЛАР';
const APPROVALS_SHEET = 'ҲУЖЖАТ_ТАСДИҚЛАШ';
const REGISTRY_SHEET = 'АКТЛАР_РЕЕСТР';
const DAILY_SHEET = 'АКТЛАР_КУНЛИК';
const SIGNER_HEADERS = ['ID', 'Lavozimi', 'FIO', 'ImzoPNG', 'Gmail', 'CreatedAt'];
const APPROVAL_HEADERS = ['ID', 'ActNo', 'SignerID', 'Lavozimi', 'FIO', 'Gmail', 'Status', 'ApprovalLink', 'TokenHash', 'CreatedAt', 'OpenedAt', 'ApprovedAt', 'IP', 'UserAgent', 'SignatureFileId'];

function clean(value) {
  return String(value ?? '').trim();
}

function q(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

function nowIso() {
  return new Date().toISOString();
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function approvalSecret() {
  const secret = clean(process.env.APPROVAL_JWT_SECRET);
  if (!secret || secret.length < 32) throw new Error('APPROVAL_JWT_SECRET камида 32 белгидан иборат бўлиши шарт');
  return secret;
}

function signApprovalToken(payload) {
  return jwt.sign({ ...payload, type: 'approval' }, approvalSecret(), {
    expiresIn: process.env.APPROVAL_TOKEN_TTL || '7d',
    issuer: 'SEG-KIP-AI',
    audience: 'document-approval',
    jwtid: crypto.randomUUID(),
  });
}

function baseUrlFromRequest(req) {
  const configured = clean(process.env.PUBLIC_BASE_URL).replace(/\/$/, '');
  if (configured && !/your-app/i.test(configured)) return configured;
  const proto = clean(req.headers['x-forwarded-proto']).split(',')[0] || req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}

function signatureValue(signer) {
  const fileId = clean(signer.signatureFileId);
  if (fileId) return fileId;
  return clean(signer.signatureUrl);
}

function pinLegacyApprovalToWorkspace(config) {
  if (config?.spreadsheetUrl) process.env.GOOGLE_SPREADSHEET_URL = config.spreadsheetUrl;
}

async function ensureApprovalSheet(config) {
  const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);
  const sheets = await getSheetsClient(config.serviceAccount);
  await ensureSheet({ ...config, sheetName: APPROVALS_SHEET });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${q(APPROVALS_SHEET)}!A1:O1`,
    valueInputOption: 'RAW',
    requestBody: { values: [APPROVAL_HEADERS] },
  });
  return { sheets, spreadsheetId };
}

async function syncWorkspaceSignersToSheet(workspace) {
  const config = resolveWorkspaceGoogleConfig(workspace);
  pinLegacyApprovalToWorkspace(config);
  const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);
  const sheets = await getSheetsClient(config.serviceAccount);
  await ensureSheet({ ...config, sheetName: SIGNERS_SHEET });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${q(SIGNERS_SHEET)}!A1:F1`,
    valueInputOption: 'RAW',
    requestBody: { values: [SIGNER_HEADERS] },
  });
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${q(SIGNERS_SHEET)}!A2:F`,
  }).catch(() => {});
  const signers = await listWorkspaceSigners(workspace.id, { includeInactive: false });
  const rows = signers.map((signer) => [
    signer.id,
    signer.position || '',
    signer.fullName || '',
    signatureValue(signer),
    signer.email || '',
    signer.createdAt ? new Date(signer.createdAt).toISOString() : new Date().toISOString(),
  ]);
  if (rows.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${q(SIGNERS_SHEET)}!A:F`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });
  }
  return { config, signers, signersCount: rows.length };
}

async function findDocument(config, actNo) {
  const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);
  const sheets = await getSheetsClient(config.serviceAccount);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(REGISTRY_SHEET)}!A:N`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const rows = result.data.values || [];
  const index = rows.findIndex((row, i) => i > 0 && clean(row[0]) === actNo);
  if (index < 0) throw new Error('Ҳужжат АКТЛАР_РЕЕСТР дан топилмади');
  return { sheets, spreadsheetId, rowNumber: index + 1, rowStart: Number(rows[index][5]) || 0 };
}

async function readApprovalRows(config, actNo) {
  const { sheets, spreadsheetId } = await ensureApprovalSheet(config);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(APPROVALS_SHEET)}!A:O`,
    valueRenderOption: 'FORMATTED_VALUE',
  }).catch(() => ({ data: { values: [] } }));
  return (result.data.values || []).slice(1).map((row, index) => ({
    rowNumber: index + 2,
    id: row[0] || '',
    actNo: row[1] || '',
    signerId: row[2] || '',
    status: row[6] || '',
    openedAt: row[10] || '',
    approvedAt: row[11] || '',
  })).filter((row) => row.id && row.actNo === actNo);
}

async function writeApproval(config, input) {
  const existing = (await readApprovalRows(config, input.actNo)).find((row) => row.signerId === input.signerId);
  const { sheets, spreadsheetId } = await ensureApprovalSheet(config);
  const row = [
    existing?.id || input.id,
    input.actNo,
    input.signerId,
    input.position,
    input.fio,
    input.gmail,
    existing?.status === 'Тасдиқланди' ? 'Тасдиқланди' : 'Кутилмоқда',
    input.link,
    input.tokenHash,
    input.createdAt,
    existing?.openedAt || '',
    existing?.approvedAt || '',
    '',
    '',
    input.signatureFileId,
  ];
  if (existing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${q(APPROVALS_SHEET)}!A${existing.rowNumber}:O${existing.rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${q(APPROVALS_SHEET)}!A:O`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
  }
  return { id: row[0], status: row[6] };
}

async function updateWaitingState(document, signers, links) {
  await document.sheets.spreadsheets.values.update({
    spreadsheetId: document.spreadsheetId,
    range: `${q(REGISTRY_SHEET)}!E${document.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['Кутилмоқда']] },
  });
  if (document.rowStart) {
    await document.sheets.spreadsheets.values.update({
      spreadsheetId: document.spreadsheetId,
      range: `${q(DAILY_SHEET)}!K${document.rowStart}:O${document.rowStart + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Status', 'Imzolovchi', 'Gmail', 'ApprovalLink', 'CreatedDate'], ['Кутилмоқда', signers.map((s) => s.fullName).join(', '), signers.map((s) => s.email).join(', '), links.join('\n'), nowIso()]] },
    }).catch(() => {});
  }
}

async function sendWorkspaceDocumentViaHttp(workspace, input, req, synced) {
  const { config, signers, signersCount } = synced;
  const actNo = clean(input.actNo);
  if (!actNo) throw new Error('Акт рақами киритилмаган');
  if (!signersCount) throw new Error('Бу объект учун актив имзо чекувчилар йўқ');
  const document = await findDocument(config, actNo);
  const baseUrl = baseUrlFromRequest(req);
  const links = [];
  const results = [];
  for (const signer of signers) {
    const approvalId = randomId('APR');
    const token = signApprovalToken({ approvalId, actNo, signerId: signer.id, email: signer.email });
    const link = `${baseUrl}/api/document/approve/${encodeURIComponent(token)}`;
    links.push(link);
    const approval = await writeApproval(config, {
      id: approvalId,
      actNo,
      signerId: signer.id,
      position: signer.position || '',
      fio: signer.fullName || '',
      gmail: signer.email || '',
      link,
      tokenHash: sha256(token),
      createdAt: nowIso(),
      signatureFileId: signatureValue(signer),
    });
    if (approval.status === 'Тасдиқланди') {
      results.push({ signer: signer.fullName, gmail: signer.email, status: 'already-approved' });
      continue;
    }
    try {
      await sendHttpEmail({
        to: signer.email,
        subject: 'Hujjatni tasdiqlash talab qilinadi',
        text: `Hujjat: ${actNo}\nTasdiqlash havolasi: ${link}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><h2>Hujjatni tasdiqlash talab qilinadi</h2><p><b>Obyekt:</b> ${escapeHtml(workspace.name)}</p><p><b>Hujjat:</b> ${escapeHtml(actNo)}</p><p><b>Imzolovchi:</b> ${escapeHtml(signer.fullName)}</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#0891b2;color:#fff;text-decoration:none;border-radius:8px">Hujjatni ochish va tasdiqlash</a></p></div>`,
      });
      results.push({ signer: signer.fullName, gmail: signer.email, status: 'sent', provider: 'http' });
    } catch (error) {
      results.push({ signer: signer.fullName, gmail: signer.email, status: 'email-failed', code: error.code || 'EMAIL_HTTP_FAILED', error: error.message });
    }
  }
  await updateWaitingState(document, signers, links);
  return { actNo, status: 'Кутилмоқда', approved: 0, total: signersCount, results, provider: 'http', workspaceId: workspace.id, workspaceName: workspace.name, signersSource: 'workspace_signers', signersSynced: signersCount };
}

export async function sendWorkspaceDocumentForApproval(workspace, input, req) {
  const synced = await syncWorkspaceSignersToSheet(workspace);
  if (!synced.signersCount) throw new Error('Бу объект учун актив имзо чекувчилар йўқ');
  pinLegacyApprovalToWorkspace(synced.config);
  if (hasHttpEmailProvider()) return sendWorkspaceDocumentViaHttp(workspace, input, req, synced);
  try {
    const result = await sendDocumentForApproval({
      spreadsheetUrl: synced.config.spreadsheetUrl,
      serviceAccount: synced.config.serviceAccount,
    }, input, req);
    return {
      ...result,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      signersSource: 'workspace_signers',
      signersSynced: synced.signersCount,
    };
  } catch (error) {
    if (/Requested entity was not found/i.test(error?.message || '')) {
      throw new Error('Workspace Google Sheet topilmadi yoki Railway GOOGLE_SPREADSHEET_URL eskirgan. Sahifani Ctrl+F5 qiling va qayta urinib ko‘ring.');
    }
    throw error;
  }
}
