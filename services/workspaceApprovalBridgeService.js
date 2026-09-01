import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ensureSheet, extractSpreadsheetId, getSheetsClient } from './googleSheetsService.js';
import { resolveWorkspaceGoogleConfig } from './workspaceGoogleService.js';
import { refreshDocumentApprovalState, sendDocumentForApproval } from './signatureApprovalService.js';
import { verifySafeEmailTransport } from './emailDiagnosticsService.js';
import { getHttpEmailSummary, hasHttpEmailProvider, sendHttpEmail } from './httpEmailService.js';
import { listWorkspaceSigners } from '../repositories/workspaceSignerRepository.js';
import { testWorkspaceFinalDocumentsFolder } from './workspaceDriveFolderService.js';

const SIGNERS_SHEET = 'ИМЗО_ЧЕКУВЧИЛАР';
const APPROVALS_SHEET = 'ҲУЖЖАТ_ТАСДИҚЛАШ';
const REGISTRY_SHEET = 'АКТЛАР_РЕЕСТР';
const SIGNER_HEADERS = ['ID', 'Lavozimi', 'FIO', 'ImzoPNG', 'Gmail', 'CreatedAt'];
const APPROVAL_HEADERS = ['ID', 'ActNo', 'SignerID', 'Lavozimi', 'FIO', 'Gmail', 'Status', 'ApprovalLink', 'TokenHash', 'CreatedAt', 'OpenedAt', 'ApprovedAt', 'IP', 'UserAgent', 'SignatureFileId'];

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeText(value) {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

function isAutomaticKipMasterSigner(signer = {}) {
  const text = normalizeText(`${signer.position || ''} ${signer.fullName || signer.fio || ''}`);
  return (text.includes('кип') && (text.includes('мастер') || text.includes('инженер')))
    || (text.includes('kip') && (text.includes('master') || text.includes('engineer')));
}

export function selectEmailApprovalTargets(signers = []) {
  return signers.filter((signer) => !(Number(signer?.slot) === 1 && isAutomaticKipMasterSigner(signer)));
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

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
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

function makeWorkspaceEmailError(result = {}) {
  const message = clean(result.error) || 'Email yuborishda xatolik.';
  const error = new Error(message);
  error.code = clean(result.code) || 'EMAIL_SEND_FAILED';
  error.statusCode = 400;
  error.rawCode = clean(result.rawCode);
  error.rawErrno = clean(result.rawErrno);
  error.rawSyscall = clean(result.rawSyscall);
  error.responseCode = Number.isFinite(Number(result.responseCode)) ? Number(result.responseCode) : undefined;
  error.recommendedFix = clean(result.recommendedFix);
  return error;
}

function compactSubjectPart(value, max = 72) {
  return clean(value).replace(/\s+/g, ' ').slice(0, max);
}

function approvalDeliveryTag(token) {
  return sha256(token).slice(0, 8).toUpperCase();
}

function buildApprovalEmailSubject({ actNo, workspaceName, approverName, deliveryTag }) {
  return [
    'Tasdiqlash talab qilinadi',
    compactSubjectPart(actNo, 80),
    compactSubjectPart(workspaceName, 80),
    compactSubjectPart(approverName, 80),
    compactSubjectPart(deliveryTag, 24),
  ].filter(Boolean).join(' — ');
}

function buildApprovalEmailText({ actNo, workspaceName, approverName, link }) {
  return [
    'Hujjatni tasdiqlash talab qilinadi.',
    '',
    `Obyekt: ${clean(workspaceName) || '-'}`,
    `Hujjat: ${clean(actNo) || '-'}`,
    `Imzolovchi: ${clean(approverName) || '-'}`,
    '',
    'Tasdiqlash uchun quyidagi havolani oching:',
    link,
    '',
    'Agar tugma ko‘rinmasa yoki email klient uni yashirsa, yuqoridagi havolani brauzerga qo‘ying.',
  ].join('\n');
}

function buildApprovalEmailHtml({ actNo, workspaceName, approverName, link }) {
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;line-height:1.55;color:#0f172a"><h2>Hujjatni tasdiqlash talab qilinadi</h2><p><b>Obyekt:</b> ${escapeHtml(workspaceName || '-')}</p><p><b>Hujjat:</b> ${escapeHtml(actNo || '-')}</p><p><b>Imzolovchi:</b> ${escapeHtml(approverName || '-')}</p><div style="margin:24px 0"><a href="${link}" style="display:inline-block;padding:12px 20px;background:#0891b2;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700">Hujjatni ochish va tasdiqlash</a></div><p style="margin:0 0 8px;color:#475569"><b>Agar tugma ko‘rinmasa</b>, quyidagi havolani brauzerga qo‘ying:</p><p style="margin:0 0 12px;word-break:break-all"><a href="${link}" style="color:#0891b2;text-decoration:underline">${link}</a></p><p style="color:#64748b">Havola shaxsiy va boshqa hujjatlarni ko‘rsatmaydi.</p></div>`;
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
  const row = rows[index];
  return {
    sheets,
    spreadsheetId,
    rowNumber: index + 1,
    actNo: row[0] || '',
    status: row[4] || '',
    rowStart: Number(row[5]) || 0,
    createdAt: row[6] || '',
    date: row[7] || '',
    deviceName: row[8] || '',
    serialNo: row[9] || '',
    place: row[10] || '',
    executor: row[11] || '',
    a4Html: row[12] || '',
    a4Json: row[13] || '',
  };
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
    input.id,
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

function readDocumentMetadata(document) {
  const meta = safeJsonParse(document?.a4Json, {});
  return meta && typeof meta === 'object' ? meta : {};
}

function assignmentSlotsFromMetadata(meta = {}) {
  const direct = Array.isArray(meta.assignedApprovers) ? meta.assignedApprovers : [];
  if (direct.length) {
    return direct.map((row, index) => ({
      slot: Number(row?.slot) || index + 1,
      signerId: clean(row?.signerId),
      fio: clean(row?.fio || row?.fullName),
      position: clean(row?.position),
      gmail: clean(row?.gmail || row?.email),
      department: clean(row?.department),
      signatureFileId: clean(row?.signatureFileId),
    })).filter((row) => row.signerId || row.fio || row.position || row.gmail);
  }
  return [1, 2, 3].map((slot) => ({
    slot,
    signerId: '',
    fio: clean(meta[`person${slot}`]),
    position: clean(meta[`position${slot}`]),
    gmail: '',
    department: clean(meta[`department${slot}`]),
    signatureFileId: clean(meta[`signatureFileId${slot}`]),
  })).filter((row) => row.fio || row.position || row.department);
}

function resolveAssignedWorkspaceSigners(meta, signers = []) {
  const requested = assignmentSlotsFromMetadata(meta);
  if (!requested.length) return { requested, signers: [] };

  const resolved = [];
  const used = new Set();

  for (const item of requested) {
    const requestedId = clean(item.signerId);
    const requestedEmail = clean(item.gmail).toLowerCase();
    const requestedName = normalizeText(item.fio);
    const requestedPosition = normalizeText(item.position);

    let signer = null;
    if (requestedId) signer = signers.find((row) => clean(row.id) === requestedId) || null;
    if (!signer && requestedEmail) signer = signers.find((row) => clean(row.email).toLowerCase() === requestedEmail) || null;
    if (!signer && requestedName && requestedPosition) {
      signer = signers.find((row) => normalizeText(row.fullName) === requestedName && normalizeText(row.position) === requestedPosition) || null;
    }
    if (!signer && requestedName) signer = signers.find((row) => normalizeText(row.fullName) === requestedName) || null;
    if (!signer) continue;

    const dedupeKey = clean(signer.id) || clean(signer.email).toLowerCase();
    if (!dedupeKey || used.has(dedupeKey)) continue;
    used.add(dedupeKey);

    resolved.push({
      ...signer,
      slot: item.slot,
      requestedName: item.fio,
      requestedPosition: item.position,
      fullName: clean(signer.fullName) || clean(item.fio),
      position: clean(signer.position) || clean(item.position),
      email: clean(signer.email) || clean(item.gmail),
    });
  }

  return { requested, signers: resolved };
}

async function persistResolvedAssignedApprovers(document, meta, signers) {
  const nextMeta = {
    ...meta,
    assignedApprovers: signers.map((signer) => ({
      slot: signer.slot || '',
      signerId: clean(signer.id),
      fio: clean(signer.fullName),
      position: clean(signer.position),
      gmail: clean(signer.email),
      department: clean(meta[`department${signer.slot}`]),
      signatureFileId: clean(signer.signatureFileId) || clean(signer.signatureUrl),
    })),
  };
  const nextJson = JSON.stringify(nextMeta);
  if (nextJson === clean(document.a4Json)) return nextMeta;
  await document.sheets.spreadsheets.values.update({
    spreadsheetId: document.spreadsheetId,
    range: `${q(REGISTRY_SHEET)}!N${document.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[nextJson]] },
  }).catch(() => {});
  document.a4Json = nextJson;
  return nextMeta;
}

async function resolveWorkspaceDocumentTargets(workspace, actNo, synced) {
  const document = await findDocument(synced.config, actNo);
  const metadata = readDocumentMetadata(document);
  const resolved = resolveAssignedWorkspaceSigners(metadata, synced.signers);
  if (!resolved.requested.length || !resolved.signers.length) {
    throw new Error('Hujjatga approver biriktirilmagan');
  }
  await persistResolvedAssignedApprovers(document, metadata, resolved.signers);
  const targetSigners = selectEmailApprovalTargets(resolved.signers);
  if (!targetSigners.length) {
    throw new Error('2- ва 3-қатор учун email орқали тасдиқловчи имзоловчилар бириктирилмаган');
  }
  return { document, metadata, assignedSigners: resolved.signers, targetSigners };
}

async function sendWorkspaceDocumentViaHttp(workspace, input, req, synced, resolvedTargets) {
  const { config } = synced;
  const { targetSigners } = resolvedTargets;
  const provider = getHttpEmailSummary();
  const actNo = clean(input.actNo);
  const existingApprovals = await readApprovalRows(config, actNo);
  const baseUrl = baseUrlFromRequest(req);
  const results = [];

  for (const signer of targetSigners) {
    if (!isValidEmail(signer.email)) {
      results.push({ signer: signer.fullName, gmail: signer.email, status: 'email-failed', approvalLinkCreated: false, code: 'EMAIL_INVALID_RECIPIENT', error: `Email manzil noto‘g‘ri yoki to‘liq emas: ${clean(signer.email)}` });
      continue;
    }
    const existing = existingApprovals.find((row) => row.signerId === signer.id);
    const approvalId = existing?.id || randomId('APR');
    const token = signApprovalToken({
      approvalId,
      actNo,
      signerId: signer.id,
      email: signer.email,
      workspaceId: workspace.id,
    });
    const link = `${baseUrl}/api/document/approve/${encodeURIComponent(token)}`;
    const deliveryTag = approvalDeliveryTag(token);
    const subject = buildApprovalEmailSubject({
      actNo,
      workspaceName: workspace.name,
      approverName: signer.fullName,
      deliveryTag,
    });
    const text = buildApprovalEmailText({
      actNo,
      workspaceName: workspace.name,
      approverName: signer.fullName,
      link,
    });
    const html = buildApprovalEmailHtml({
      actNo,
      workspaceName: workspace.name,
      approverName: signer.fullName,
      link,
    });
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
      results.push({ signer: signer.fullName, gmail: signer.email, status: 'already-approved', approvalLinkCreated: true });
      continue;
    }
    try {
      await sendHttpEmail({
        to: signer.email,
        subject,
        text,
        html,
      });
      results.push({ signer: signer.fullName, gmail: signer.email, status: 'sent', provider: provider.provider, approvalLinkCreated: true });
    } catch (error) {
      results.push({ signer: signer.fullName, gmail: signer.email, status: 'email-failed', approvalLinkCreated: true, code: error.code || 'EMAIL_HTTP_FAILED', error: error.message, providerStatus: error.providerStatus || '', providerMessage: error.providerMessage || '' });
    }
  }

  const total = targetSigners.length;
  const sent = results.filter((item) => item.status === 'sent').length;
  const failed = results.filter((item) => item.status === 'email-failed').length;
  const approved = results.filter((item) => item.status === 'already-approved').length;
  const status = total > 0 && approved === total && failed === 0 && sent === 0 ? 'Тасдиқланди' : (sent > 0 || approved > 0 ? 'Кутилмоқда' : 'Email xatosi');
  await refreshDocumentApprovalState(config, actNo, baseUrl);
  return { actNo, status, sent, failed, approved, total, results, provider: provider.provider, fromMode: provider.fromMode, warning: provider.warning || '', recommendedFix: provider.recommendedFix || '', workspaceId: workspace.id, workspaceName: workspace.name, signersSource: 'assigned_workspace_signers', signersSynced: synced.signersCount, targetedApprovers: total };
}

export async function sendWorkspaceDocumentForApproval(workspace, input, req) {
  const provider = getHttpEmailSummary();
  if (!provider.hasHttpEmailProvider) {
    const emailCheck = await verifySafeEmailTransport();
    if (!emailCheck.ok) {
      throw makeWorkspaceEmailError({
        ...emailCheck,
        recommendedFix: clean(emailCheck.recommendedFix) || 'Railway email sozlamalarini tekshiring yoki HTTP email provider ishlating.',
      });
    }
  }

  // Fail before sending approval links when the destination cannot support
  // service-account-owned files. This avoids approvals that can never export.
  await testWorkspaceFinalDocumentsFolder(workspace, { writeTest: false });

  const synced = await syncWorkspaceSignersToSheet(workspace);
  if (!synced.signersCount) throw new Error('Бу объект учун актив имзо чекувчилар йўқ');

  const actNo = clean(input.actNo);
  if (!actNo) throw new Error('Акт рақами киритилмаган');
  const resolvedTargets = await resolveWorkspaceDocumentTargets(workspace, actNo, synced);

  if (hasHttpEmailProvider()) return sendWorkspaceDocumentViaHttp(workspace, { ...input, actNo }, req, synced, resolvedTargets);

  try {
    const result = await sendDocumentForApproval({
      spreadsheetUrl: synced.config.spreadsheetUrl,
      serviceAccount: synced.config.serviceAccount,
    }, {
      ...input,
      actNo,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      assignedApprovers: resolvedTargets.targetSigners.map((signer) => ({
        slot: signer.slot || '',
        signerId: signer.id,
        fio: signer.fullName,
        position: signer.position,
        gmail: signer.email,
      })),
    }, req);
    return {
      ...result,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      signersSource: 'assigned_workspace_signers',
      signersSynced: synced.signersCount,
      targetedApprovers: resolvedTargets.targetSigners.length,
    };
  } catch (error) {
    if (/Requested entity was not found/i.test(error?.message || '')) {
      throw new Error('Workspace Google Sheet topilmadi yoki Railway GOOGLE_SPREADSHEET_URL eskirgan. Sahifani Ctrl+F5 qiling va qayta urinib ko‘ring.');
    }
    throw error;
  }
}
