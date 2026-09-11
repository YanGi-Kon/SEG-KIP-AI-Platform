import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  ensureSheet,
  extractSpreadsheetId,
  getSheetsClient,
} from './googleSheetsService.js';
import { resolveWorkspaceGoogleConfig } from './workspaceGoogleService.js';
import { appendAudit } from './signatureApprovalService.js';
import { sendSafeEmail, verifySafeEmailTransport } from './emailDiagnosticsService.js';
import { hasHttpEmailProvider } from './httpEmailService.js';
import { listWorkspaceSigners } from '../repositories/workspaceSignerRepository.js';
import { getToPeriodBundle } from '../repositories/toPeriodRepository.js';
import { sendToPeriodForApproval as sendToPeriodViaHttp } from './toPeriodApprovalService.js';

const APPROVALS_SHEET = 'ҲУЖЖАТ_ТАСДИҚЛАШ';
const APPROVAL_HEADERS = ['ID', 'ActNo', 'SignerID', 'Lavozimi', 'FIO', 'Gmail', 'Status', 'ApprovalLink', 'TokenHash', 'CreatedAt', 'OpenedAt', 'ApprovedAt', 'IP', 'UserAgent', 'SignatureFileId'];
const MONTHS = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function clean(value) {
  return String(value ?? '').trim();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function q(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
}

function approvalSecret() {
  const value = clean(process.env.APPROVAL_JWT_SECRET);
  if (!value || value.length < 32) {
    const error = new Error('APPROVAL_JWT_SECRET камида 32 белгидан иборат бўлиши шарт');
    error.code = 'TO_APPROVAL_SECRET_INVALID';
    error.statusCode = 500;
    throw error;
  }
  return value;
}

function signToken(payload) {
  return jwt.sign({ ...payload, type: 'to-period-approval' }, approvalSecret(), {
    expiresIn: process.env.APPROVAL_TOKEN_TTL || '7d',
    issuer: 'SEG-KIP-AI',
    audience: 'to-period-approval',
    jwtid: crypto.randomUUID(),
  });
}

function periodKey(year, month) {
  return `TO-${Number(year)}-${String(Number(month)).padStart(2, '0')}`;
}

function periodLabel(year, month) {
  return `${MONTHS[Number(month)] || month} ${Number(year)}`;
}

function baseUrlFromRequest(req) {
  const configured = clean(process.env.PUBLIC_BASE_URL).replace(/\/$/, '');
  if (configured && !/your-app/i.test(configured)) return configured;
  const proto = clean(req.headers?.['x-forwarded-proto']).split(',')[0] || req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}

function makeError(code, message, recommendedFix = '', statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.recommendedFix = recommendedFix;
  return error;
}

async function approvalRows(workspace, docKey) {
  const config = resolveWorkspaceGoogleConfig(workspace);
  const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);
  const sheets = await getSheetsClient(config.serviceAccount);
  await ensureSheet({ ...config, sheetName: APPROVALS_SHEET });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${q(APPROVALS_SHEET)}!A1:O1`,
    valueInputOption: 'RAW',
    requestBody: { values: [APPROVAL_HEADERS] },
  });
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(APPROVALS_SHEET)}!A:O`,
    valueRenderOption: 'FORMATTED_VALUE',
  }).catch(() => ({ data: { values: [] } }));
  const rows = (result.data.values || []).slice(1).map((row, index) => ({
    rowNumber: index + 2,
    id: row[0] || '',
    docKey: row[1] || '',
    signerId: row[2] || '',
    position: row[3] || '',
    fio: row[4] || '',
    email: row[5] || '',
    status: row[6] || '',
    link: row[7] || '',
    tokenHash: row[8] || '',
    createdAt: row[9] || '',
    openedAt: row[10] || '',
    approvedAt: row[11] || '',
    ip: row[12] || '',
    userAgent: row[13] || '',
    signatureFileId: row[14] || '',
  })).filter((row) => row.id && row.docKey === docKey);
  return { sheets, spreadsheetId, rows };
}

async function saveApproval(current, existing, input, { resetExisting = false } = {}) {
  const row = [
    existing?.id || input.id,
    input.docKey,
    input.signerId,
    input.position,
    input.fio,
    input.email,
    resetExisting ? 'Кутилмоқда' : (existing?.status === 'Тасдиқланди' ? 'Тасдиқланди' : 'Кутилмоқда'),
    input.link,
    resetExisting ? input.tokenHash : (existing?.status === 'Тасдиқланди' ? existing.tokenHash : input.tokenHash),
    resetExisting ? input.createdAt : (existing?.createdAt || input.createdAt),
    resetExisting ? '' : (existing?.openedAt || ''),
    resetExisting ? '' : (existing?.approvedAt || ''),
    resetExisting ? '' : (existing?.ip || ''),
    resetExisting ? '' : (existing?.userAgent || ''),
    input.signatureFileId || existing?.signatureFileId || '',
  ];

  if (existing) {
    await current.sheets.spreadsheets.values.update({
      spreadsheetId: current.spreadsheetId,
      range: `${q(APPROVALS_SHEET)}!A${existing.rowNumber}:O${existing.rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });
  } else {
    await current.sheets.spreadsheets.values.append({
      spreadsheetId: current.spreadsheetId,
      range: `${q(APPROVALS_SHEET)}!A:O`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
  }
  return { id: row[0], status: row[6] };
}

async function sendViaSmtp(workspace, year, month, req) {
  const transport = await verifySafeEmailTransport();
  if (!transport?.ok) {
    throw makeError(
      transport?.code || 'EMAIL_CONFIG_MISSING',
      transport?.error || 'Email yuborish sozlanmagan.',
      transport?.recommendedFix || 'GMAIL_USER/GMAIL_APP_PASSWORD yoki SMTP_USER/SMTP_PASS ni sozlang.',
    );
  }

  const bundle = await getToPeriodBundle(workspace.id, year, month);
  if (!bundle) throw makeError('TO_PERIOD_NOT_FOUND', 'TO davri topilmadi', '', 404);

  const signers = await listWorkspaceSigners(workspace.id, { includeInactive: false });
  const targets = [...signers];
  if (!targets.length) {
    throw makeError('TO_SIGNERS_NOT_FOUND', 'Bu Workspace uchun faol imzo chekuvchi topilmadi');
  }
  const invalidRecipients = targets.filter((row) => !isEmail(row.email));
  if (invalidRecipients.length) {
    throw makeError(
      'EMAIL_INVALID_RECIPIENT',
      `Tasdiqlovchi Gmail manzili noto‘g‘ri: ${invalidRecipients.map((row) => clean(row.fullName) || clean(row.email) || 'tasdiqlovchi').join(', ')}`,
      '5. TO JURNALI uchun umumiy imzolovchilar registrida har bir faol imzolovchining email manzilini to‘liq kiriting.',
    );
  }

  const docKey = periodKey(year, month);
  const label = periodLabel(year, month);
  const baseUrl = baseUrlFromRequest(req);
  const approvalState = await approvalRows(workspace, docKey);
  const existingBySigner = new Map(approvalState.rows.map((row) => [clean(row.signerId), row]));
  const results = [];

  for (const signer of targets) {
    const existing = existingBySigner.get(clean(signer.id));
    const approvalId = existing?.id || crypto.randomUUID();
    const token = signToken({
      approvalId,
      workspaceId: workspace.id,
      periodId: bundle.period.id,
      year: Number(year),
      month: Number(month),
      signerId: signer.id,
      email: signer.email,
    });
    const link = `${baseUrl}/api/to-period-bridge/approve/${encodeURIComponent(token)}`;

    await saveApproval(approvalState, existing, {
      id: approvalId,
      docKey,
      signerId: signer.id,
      position: signer.position || '',
      fio: signer.fullName || '',
      email: signer.email || '',
      link,
      tokenHash: sha256(token),
      createdAt: new Date().toISOString(),
      signatureFileId: signer.signatureFileId || signer.signatureUrl || '',
    }, { resetExisting: true });

    const deliveryTag = sha256(token).slice(0, 8).toUpperCase();
    const subject = `TO hujjatini tasdiqlash talab qilinadi — ${label} — ${clean(workspace.name)} — ${clean(signer.fullName)} — ${deliveryTag}`;
    const text = [
      'TO hujjatini tasdiqlash talab qilinadi.',
      '',
      `Obyekt: ${clean(workspace.name)}`,
      `Davr: ${label}`,
      `Imzolovchi: ${clean(signer.fullName)}`,
      '',
      'Hujjatni A4 ko‘rinishda ochish va tasdiqlash:',
      link,
      '',
      'Agar tugma ko‘rinmasa, havolani brauzerga qo‘ying.',
    ].join('\n');
    const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;line-height:1.55;color:#0f172a"><h2>TO hujjatini tasdiqlash talab qilinadi</h2><p><b>Obyekt:</b> ${esc(workspace.name)}</p><p><b>Davr:</b> ${esc(label)}</p><p><b>Imzolovchi:</b> ${esc(signer.fullName)}</p><div style="margin:24px 0"><a href="${esc(link)}" style="display:inline-block;padding:12px 20px;background:#0891b2;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">A4 hujjatni ochish va tasdiqlash</a></div><p style="word-break:break-all"><a href="${esc(link)}">${esc(link)}</a></p><p style="color:#64748b">Havola shaxsiy va faqat ushbu imzolovchiga tegishli.</p></div>`;

    try {
      const delivery = await sendSafeEmail({ to: signer.email, subject, text, html });
      const providerMessageId = clean(delivery?.messageId || delivery?.id);
      results.push({ signer: signer.fullName, email: signer.email, status: 'sent', provider: 'smtp', providerMessageId });
      await appendAudit(resolveWorkspaceGoogleConfig(workspace), {
        action: 'DOCUMENT_SENT',
        actor: clean(req?.user?.fullName || req?.user?.email) || 'KIP Administrator',
        actNo: docKey,
        signerId: signer.id,
        gmail: signer.email,
        ip: req?.ip,
        userAgent: req?.get?.('user-agent') || '',
        details: `module=TO; provider=smtp; messageId=${providerMessageId || '-'}; deliveryTag=${deliveryTag}`,
      }).catch(() => {});
    } catch (emailError) {
      results.push({
        signer: signer.fullName,
        email: signer.email,
        status: 'email-failed',
        code: emailError?.code || 'EMAIL_SEND_FAILED',
        error: emailError?.message || 'Email yuborish xatosi',
        recommendedFix: emailError?.recommendedFix || '',
      });
      await appendAudit(resolveWorkspaceGoogleConfig(workspace), {
        action: 'EMAIL_FAILED',
        actor: clean(req?.user?.fullName || req?.user?.email) || 'KIP Administrator',
        actNo: docKey,
        signerId: signer.id,
        gmail: signer.email,
        ip: req?.ip,
        userAgent: req?.get?.('user-agent') || '',
        details: `module=TO; ${emailError?.code || 'EMAIL_SEND_FAILED'}: ${emailError?.message || 'Email yuborish xatosi'}`,
      }).catch(() => {});
    }
  }

  return {
    key: docKey,
    label,
    provider: 'smtp',
    deliveryMode: 'smtp',
    total: targets.length,
    sent: results.filter((row) => row.status === 'sent').length,
    approved: 0,
    failed: results.filter((row) => row.status === 'email-failed').length,
    results,
  };
}

export async function sendToPeriodForApprovalWithFallback(workspace, year, month, req) {
  if (hasHttpEmailProvider()) {
    return sendToPeriodViaHttp(workspace, year, month, req);
  }
  return sendViaSmtp(workspace, year, month, req);
}
