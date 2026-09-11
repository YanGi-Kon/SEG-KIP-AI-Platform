import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  ensureSheet,
  extractSpreadsheetId,
  getSheetsClient,
} from './googleSheetsService.js';
import { resolveWorkspaceGoogleConfig } from './workspaceGoogleService.js';
import { getHttpEmailSummary, hasHttpEmailProvider, sendHttpEmail } from './httpEmailService.js';
import { sendSafeEmail, verifySafeEmailTransport } from './emailDiagnosticsService.js';
import { appendAudit, createCsrfToken, createSignatureImageToken, verifyCsrfToken } from './signatureApprovalService.js';
import { listWorkspaceSigners } from '../repositories/workspaceSignerRepository.js';
import { findWorkspaceById } from '../repositories/workspaceRepository.js';
import { getToPeriodBundle, listToPeriods } from '../repositories/toPeriodRepository.js';

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

function makeError(code, message, recommendedFix = '', statusCode = 400, extra = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.recommendedFix = recommendedFix;
  Object.assign(error, extra);
  return error;
}

function activeApprovals(rows = []) {
  return rows.filter((row) => clean(row?.status) !== 'Бекор қилинди');
}

export function summarizeToApprovals(rows = []) {
  const approvals = activeApprovals(rows);
  const total = approvals.length;
  const approved = approvals.filter((row) => clean(row?.status) === 'Тасдиқланди').length;
  const status = total === 0
    ? 'Юборилмаган'
    : approved === total
      ? 'Тасдиқланди'
      : approved > 0
        ? 'Қисман тасдиқланди'
        : 'Кутилмоқда';
  return { total, approved, pending: Math.max(0, total - approved), status };
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

function signToken(payload) {
  return jwt.sign({ ...payload, type: 'to-period-approval' }, approvalSecret(), {
    expiresIn: process.env.APPROVAL_TOKEN_TTL || '7d',
    issuer: 'SEG-KIP-AI',
    audience: 'to-period-approval',
    jwtid: crypto.randomUUID(),
  });
}

export function verifyToPeriodApprovalToken(token) {
  const payload = jwt.verify(String(token || ''), approvalSecret(), {
    issuer: 'SEG-KIP-AI',
    audience: 'to-period-approval',
  });
  if (payload.type !== 'to-period-approval') throw new Error('TO tasdiqlash tokeni turi noto‘g‘ri');
  return payload;
}

async function ensureApprovalSheet(workspace) {
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
  return { config, sheets, spreadsheetId };
}

async function approvalRows(workspace, docKey) {
  const { config, sheets, spreadsheetId } = await ensureApprovalSheet(workspace);
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
  return { config, sheets, spreadsheetId, rows };
}

async function writeApproval(current, existing, input, { resetExisting = false } = {}) {
  const id = existing?.id || input.id;
  const row = [
    id,
    input.docKey,
    input.signerId,
    input.position,
    input.fio,
    input.email,
    resetExisting ? 'Кутилмоқда' : (existing?.status === 'Тасдиқланди' ? 'Тасдиқланди' : 'Кутилмоқда'),
    input.link,
    input.tokenHash,
    input.createdAt,
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

  return {
    id,
    docKey: input.docKey,
    signerId: input.signerId,
    position: input.position,
    fio: input.fio,
    email: input.email,
    status: row[6],
    link: input.link,
    tokenHash: input.tokenHash,
    createdAt: input.createdAt,
    openedAt: row[10],
    approvedAt: row[11],
    signatureFileId: row[14],
    rowNumber: existing?.rowNumber || 0,
  };
}

async function revokeStaleApprovals(current, targetSignerIds = new Set()) {
  for (const row of current.rows) {
    if (targetSignerIds.has(clean(row.signerId))) continue;
    const revoked = [
      row.id,
      row.docKey,
      row.signerId,
      row.position,
      row.fio,
      row.email,
      'Бекор қилинди',
      '',
      `revoked:${Date.now()}:${row.id}`,
      row.createdAt,
      row.openedAt || '',
      row.approvedAt || '',
      row.ip || '',
      row.userAgent || '',
      row.signatureFileId || '',
    ];
    await current.sheets.spreadsheets.values.update({
      spreadsheetId: current.spreadsheetId,
      range: `${q(APPROVALS_SHEET)}!A${row.rowNumber}:O${row.rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [revoked] },
    });
  }
}

async function updateApprovalRow(workspace, row, changes = {}) {
  const current = await approvalRows(workspace, row.docKey);
  const found = current.rows.find((item) => item.id === row.id);
  if (!found) throw new Error('TO tasdiqlash yozuvi topilmadi');
  const next = [
    found.id,
    found.docKey,
    found.signerId,
    found.position,
    found.fio,
    found.email,
    changes.status ?? found.status,
    found.link,
    found.tokenHash,
    found.createdAt,
    changes.openedAt ?? found.openedAt,
    changes.approvedAt ?? found.approvedAt,
    changes.ip ?? found.ip,
    changes.userAgent ?? found.userAgent,
    found.signatureFileId,
  ];
  await current.sheets.spreadsheets.values.update({
    spreadsheetId: current.spreadsheetId,
    range: `${q(APPROVALS_SHEET)}!A${found.rowNumber}:O${found.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [next] },
  });
  return { ...found, status: next[6], openedAt: next[10], approvedAt: next[11], ip: next[12], userAgent: next[13] };
}

function sectionRows(items = []) {
  const sections = [];
  const byName = new Map();
  for (const item of items) {
    const name = clean(item.sectionName) || 'ASOSIY';
    if (!byName.has(name)) {
      const section = { name, items: [] };
      byName.set(name, section);
      sections.push(section);
    }
    byName.get(name).items.push(item);
  }
  return sections;
}

export function renderToPeriodA4(bundle, { workspaceName = '', approvals = [], baseUrl = '' } = {}) {
  const period = bundle?.period || {};
  const items = Array.isArray(bundle?.items) ? bundle.items : [];
  const sections = sectionRows(items);
  const date = clean(period.documentDate) || `${period.year}-${String(period.month).padStart(2, '0')}-25`;
  const day = String(date).slice(8, 10) || '25';
  const monthName = MONTHS[Number(period.month)] || '';
  const bodyRows = [];
  let sequence = 0;

  for (const section of sections) {
    bodyRows.push(`<tr class="to-group"><td colspan="8">${esc(section.name)}</td></tr>`);
    for (const item of section.items) {
      sequence += 1;
      bodyRows.push(`<tr><td>${sequence}</td><td>${esc(item.serialNo)}</td><td>${esc(item.equipmentName)}</td><td>${esc(item.positionNo)}</td><td>${esc(item.quantity)}</td><td>${esc(item.technicalState)}</td><td>${esc(item.workType)}</td><td>${esc(item.note)}</td></tr>`);
    }
  }

  const visibleApprovals = activeApprovals(approvals);
  const signatureRows = visibleApprovals.length
    ? `<div class="to-a4-signatures"><div class="to-a4-signatures-title">Имзолар:</div>${visibleApprovals.map((row) => {
      const approved = clean(row.status) === 'Тасдиқланди';
      const fileId = clean(row.signatureFileId);
      const signaturePath = fileId ? `/api/signature/render/${createSignatureImageToken(fileId)}` : '';
      const image = approved && signaturePath
        ? `<img src="${esc(`${clean(baseUrl).replace(/\/$/, '')}${signaturePath}`)}" alt="${esc(row.fio || 'Имзо')} имзоси">`
        : `<span class="to-a4-signature-placeholder">${approved ? 'Имзо файли йўқ' : 'Кутилмоқда'}</span>`;
      return `<div class="to-a4-signature-row"><div><b>${esc(row.position || '')}</b><small>Лавозими</small></div><div class="to-a4-signature-image">${image}<small>Имзо</small></div><div><b>${esc(row.fio || '')}</b><small>Ф.И.Ш.</small></div></div>`;
    }).join('')}</div>`
    : '<div class="to-a4-signatures"><div class="to-a4-signatures-title">Имзолар:</div><div class="to-a4-signature-empty">Hujjat hali imzolovchilarga yuborilmagan.</div></div>';

  return `<article class="to-a4-document">
    <div class="to-a4-regulation">Приложение № 2 к Регламенту проведения технического обслуживания<br>контрольно-измерительных приборов, средств и систем автоматизации<br>на объектах СП ООО «SANEG»<br>«${esc(day)}» ${esc(monthName)} ${esc(period.year)}г. ТПП «Андижан»</div>
    <div class="to-a4-title">АКТ<br>проведения работ по ТО-1<br>приборов и средств автоматизации ТПП «Андижан» ЦДНГ №1</div>
    <div class="to-a4-workspace">${workspaceName ? `Workspace: ${esc(workspaceName)}` : ''}</div>
    <div class="to-a4-preamble">Мы, нижеподписавшиеся, составили настоящий акт о том, что согласно ежегодному графику проведения технического обслуживания СИ, КИПиА и в соответствии с Регламентом по проведению технического обслуживания контрольно-измерительных приборов, средств и систем автоматизации на объектах СП ООО «SANEG», выполнены следующие виды работ:</div>
    <table class="to-a4-table"><colgroup><col style="width:6%"><col style="width:11%"><col style="width:20%"><col style="width:8%"><col style="width:10%"><col style="width:17%"><col style="width:13%"><col style="width:15%"></colgroup><thead><tr><th>№</th><th>Зав. №</th><th>Наименование оборудования</th><th>Поз.</th><th>кол-во, шт.</th><th>Техническое состояние</th><th>Вид работ</th><th>Примечание</th></tr></thead><tbody>${bodyRows.join('')}</tbody></table>
    <div class="to-a4-conclusion">${esc(period.conclusion || 'Заключение: оборудование исправно и пригодно к эксплуатации')}</div>
    ${signatureRows}
  </article>`;
}

export function toA4Styles() {
  return `.to-a4-document{width:210mm;min-height:297mm;margin:0 auto;background:#fff;color:#111;padding:14mm 16mm 16mm;box-sizing:border-box;font:14px/1.35 "Times New Roman",serif}.to-a4-regulation{text-align:right;font-size:12px;margin-bottom:9mm}.to-a4-title{text-align:center;font-size:18px;font-weight:700;line-height:1.25;margin-bottom:7mm}.to-a4-workspace{text-align:right;font-size:11px;margin-bottom:4mm;color:#475569}.to-a4-preamble{text-align:justify;margin-bottom:5mm}.to-a4-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px}.to-a4-table th,.to-a4-table td{border:1px solid #111;padding:4px;text-align:center;vertical-align:middle;word-break:break-word}.to-a4-table th{background:#f3f4f6;font-weight:700}.to-a4-table .to-group td{text-align:left;font-weight:700;background:#e5e7eb}.to-a4-conclusion{margin-top:7mm;font-weight:700}.to-a4-signatures{margin-top:9mm;display:grid;gap:8px}.to-a4-signatures-title{font-weight:700;margin-bottom:2px}.to-a4-signature-row{display:grid;grid-template-columns:1fr 180px 1fr;gap:14px;align-items:end;page-break-inside:avoid}.to-a4-signature-row>div{min-height:46px;border-bottom:1px solid #111;text-align:center;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}.to-a4-signature-row b{font-weight:400;min-height:20px}.to-a4-signature-row small{display:block;font-size:9px;margin-top:3px}.to-a4-signature-image img{display:block;max-width:155px;max-height:52px;object-fit:contain;margin:auto}.to-a4-signature-placeholder{color:#64748b;font:11px Arial,sans-serif;min-height:30px;display:grid;place-items:center}.to-a4-signature-empty{font-size:11px;color:#64748b}@media(max-width:900px){.to-a4-document{width:100%;min-height:0;padding:24px 18px}.to-a4-table{font-size:10px}.to-a4-signature-row{grid-template-columns:1fr 120px 1fr}}`;
}

function publicApprovalPage({ bundle, workspace, approval, approvals, csrfToken, token, baseUrl }) {
  const approved = approval.status === 'Тасдиқланди';
  const a4 = renderToPeriodA4(bundle, { workspaceName: workspace.name, approvals, baseUrl });
  const expected = {
    approvalId: clean(approval.id),
    signerId: clean(approval.signerId),
    email: clean(approval.email).toLowerCase(),
  };

  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TO hujjatini tasdiqlash</title><style>body{margin:0;padding:24px;background:#071427;color:#eaf7ff;font-family:Arial,sans-serif}.approval-shell{max-width:1100px;margin:auto}.approval-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:14px}.approval-card{background:#0b1d31;border:1px solid rgba(34,211,238,.28);border-radius:16px;padding:14px;margin-bottom:16px}.approval-card b{color:#a5f3fc}.approval-badge{padding:8px 12px;border-radius:999px;background:${approved ? '#166534' : '#92400e'};font-weight:800}.approval-actions{display:flex;justify-content:center;margin:22px 0}.approval-btn{border:0;border-radius:12px;padding:13px 24px;background:linear-gradient(135deg,#15803d,#22c55e);color:#fff;font-weight:800;cursor:pointer;font-size:15px}.approval-btn:disabled{opacity:.55;cursor:not-allowed}.approval-msg{text-align:center;min-height:26px;color:#bbf7d0}.approval-recipient{text-align:center;color:#cbd5e1;font-size:13px;margin:8px 0}.approval-recipient b{color:#fff}${toA4Styles()}</style></head><body><div class="approval-shell"><div class="approval-head"><div><h2>TO hujjatini tasdiqlash</h2><span>${esc(periodLabel(bundle.period.year, bundle.period.month))}</span></div><div id="status" class="approval-badge">${esc(approval.status)}</div></div><div class="approval-card"><div><b>Obyekt:</b> ${esc(workspace.name || '-')}</div><div><b>Imzolovchi:</b> ${esc(approval.fio || '-')}</div><div><b>Lavozim:</b> ${esc(approval.position || '-')}</div></div>${a4}<div class="approval-recipient">Ushbu havola: <b>${esc(approval.fio || '-')}</b> · ${esc(approval.email || '-')}</div><div class="approval-actions"><button id="approveBtn" class="approval-btn" type="button" ${approved ? 'disabled' : ''}>${approved ? '✓ Тасдиқланган' : 'Хужатни тасдиқлаш'}</button></div><div id="approvalMsg" class="approval-msg">${approved ? 'Hujjat avval tasdiqlangan.' : ''}</div></div><script>const token=${JSON.stringify(token)};const csrfToken=${JSON.stringify(csrfToken)};const expectedApproval=${JSON.stringify(expected)};const btn=document.getElementById('approveBtn'),msg=document.getElementById('approvalMsg'),statusEl=document.getElementById('status');function sameApproval(d){return String(d?.approvalId||'')===expectedApproval.approvalId&&String(d?.signerId||'')===expectedApproval.signerId&&String(d?.email||'').toLowerCase()===expectedApproval.email;}function paint(d){if(!sameApproval(d)){btn.disabled=true;statusEl.textContent='Havola mos emas';msg.textContent='Tasdiqlovchi havolasi boshqa yozuv bilan mos kelmadi.';return;}const isApproved=Boolean(d.approved);statusEl.textContent=isApproved?'Тасдиқланди':'Кутилмоқда';btn.textContent=isApproved?'✓ Тасдиқланган':'Хужатни тасдиқлаш';btn.disabled=isApproved;if(isApproved&&d.approvedAt)msg.textContent='Tasdiqlangan vaqt: '+d.approvedAt;}async function refreshStatus(){try{const r=await fetch('/api/to-period-bridge/approve/status/'+encodeURIComponent(token),{cache:'no-store'});const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'Status xatosi');paint(d);}catch(e){btn.disabled=true;msg.textContent=e.message;}}btn?.addEventListener('click',async()=>{btn.disabled=true;msg.textContent='Tasdiqlanmoqda...';try{const r=await fetch('/api/to-period-bridge/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,csrfToken})});const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'Tasdiqlash xatosi');const individual={approvalId:d.approval?.id,signerId:d.approval?.signerId,email:d.approval?.email,status:d.approval?.status,approvedAt:d.approval?.approvedAt,approved:d.approval?.status==='Тасдиқланди'};if(!sameApproval(individual))throw new Error('Tasdiqlash javobi ushbu tasdiqlovchiga tegishli emas');paint(individual);msg.textContent='Hujjat muvaffaqiyatli tasdiqlandi.';setTimeout(()=>location.reload(),450);}catch(e){btn.disabled=false;msg.textContent=e.message;}});window.addEventListener('pageshow',()=>void refreshStatus());void refreshStatus();</script></body></html>`;
}

export async function listToReportFolders(workspaceId) {
  return listToPeriods(workspaceId, {});
}

export async function getToPeriodReport(workspace, year, month, req = null) {
  const bundle = await getToPeriodBundle(workspace.id, year, month);
  if (!bundle) throw makeError('TO_PERIOD_NOT_FOUND', 'TO davri topilmadi', '', 404);
  const docKey = periodKey(year, month);
  const approvals = activeApprovals((await approvalRows(workspace, docKey)).rows);
  const approvalSummary = summarizeToApprovals(approvals);
  const baseUrl = req ? baseUrlFromRequest(req) : clean(process.env.PUBLIC_BASE_URL).replace(/\/$/, '');
  return {
    key: docKey,
    label: periodLabel(year, month),
    period: bundle.period,
    items: bundle.items,
    approvals,
    approvalSummary,
    a4Html: renderToPeriodA4(bundle, { workspaceName: workspace.name, approvals, baseUrl }),
    a4Css: toA4Styles(),
  };
}

export async function sendToPeriodForApproval(workspace, year, month, req) {
  const bundle = await getToPeriodBundle(workspace.id, year, month);
  if (!bundle) throw makeError('TO_PERIOD_NOT_FOUND', 'TO davri topilmadi', '', 404);

  const provider = getHttpEmailSummary();
  let smtpSummary = null;
  if (!provider.hasHttpEmailProvider) {
    smtpSummary = await verifySafeEmailTransport();
    if (!smtpSummary?.ok) {
      throw makeError(
        smtpSummary?.code || 'EMAIL_CONFIG_MISSING',
        smtpSummary?.error || 'Email yuborish sozlanmagan.',
        smtpSummary?.recommendedFix || 'GMAIL_USER/GMAIL_APP_PASSWORD yoki SMTP_USER/SMTP_PASS ni sozlang.',
      );
    }
  }

  const signers = await listWorkspaceSigners(workspace.id, { includeInactive: false });
  if (!signers.length) {
    throw makeError('TO_SIGNERS_NOT_FOUND', 'Bu Workspace uchun faol imzo chekuvchi topilmadi');
  }

  const invalidRecipients = signers.filter((row) => !isEmail(row.email));
  if (invalidRecipients.length) {
    throw makeError(
      'EMAIL_INVALID_RECIPIENT',
      `Tasdiqlovchi Gmail manzili noto‘g‘ri: ${invalidRecipients.map((row) => clean(row.fullName) || clean(row.email) || 'tasdiqlovchi').join(', ')}`,
      'Imzo chekuvchilar ro‘yxatida har bir tasdiqlovchining Gmail manzilini name@gmail.com ko‘rinishida kiriting.',
    );
  }

  if (provider.hasHttpEmailProvider && provider.fromMode === 'missing') {
    throw makeError('EMAIL_FROM_MISSING', 'EMAIL_FROM kiritilmagan.', provider.recommendedFix);
  }

  if (provider.hasHttpEmailProvider && provider.fromMode === 'resend-test-sender') {
    const uniqueRecipients = new Set(signers.map((row) => clean(row.email).toLowerCase()).filter(Boolean));
    if (uniqueRecipients.size > 1) {
      throw makeError(
        'EMAIL_PROVIDER_RECIPIENT_NOT_ALLOWED',
        'Resend test sender bilan bir nechta turli Gmail manziliga tasdiqlash xabari yuborib bo‘lmaydi.',
        provider.recommendedFix,
      );
    }
  }

  const docKey = periodKey(year, month);
  const label = periodLabel(year, month);
  const baseUrl = baseUrlFromRequest(req);
  const current = await approvalRows(workspace, docKey);
  const targetSignerIds = new Set(signers.map((row) => clean(row.id)));
  await revokeStaleApprovals(current, targetSignerIds);

  const existingBySigner = new Map(current.rows.map((row) => [clean(row.signerId), row]));
  const results = [];
  const deliveryMode = provider.hasHttpEmailProvider ? 'http' : 'smtp';

  for (const signer of signers) {
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
    const subject = `TO hujjatini tasdiqlash — ${label} — ${clean(workspace.name)}`;
    const text = [
      'TO hujjatini tasdiqlash talab qilinadi.',
      '',
      `Obyekt: ${clean(workspace.name)}`,
      `Davr: ${label}`,
      `Imzolovchi: ${clean(signer.fullName)}`,
      '',
      'Hujjatni A4 ko‘rinishda ochish va tasdiqlash:',
      link,
    ].join('\n');
    const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;line-height:1.55;color:#0f172a"><h2>TO hujjatini tasdiqlash talab qilinadi</h2><p><b>Obyekt:</b> ${esc(workspace.name)}</p><p><b>Davr:</b> ${esc(label)}</p><p><b>Imzolovchi:</b> ${esc(signer.fullName)}</p><div style="margin:24px 0"><a href="${esc(link)}" style="display:inline-block;padding:12px 20px;background:#0891b2;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">A4 hujjatni ochish va tasdiqlash</a></div><p style="color:#64748b">Havola shaxsiy. Uni boshqa shaxsga yubormang. Hujjat qayta yuborilsa oldingi havola bekor qilinadi.</p></div>`;

    await writeApproval(current, existing, {
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

    try {
      const delivery = provider.hasHttpEmailProvider
        ? await sendHttpEmail({ to: signer.email, subject, text, html })
        : await sendSafeEmail({ to: signer.email, subject, text, html });
      const providerMessageId = clean(delivery?.id || delivery?.messageId);
      results.push({
        signer: signer.fullName,
        email: signer.email,
        gmail: signer.email,
        status: 'sent',
        provider: provider.hasHttpEmailProvider ? provider.provider : 'smtp',
        providerMessageId,
        approvalLinkCreated: true,
      });
      await appendAudit(current.config, {
        action: 'DOCUMENT_SENT',
        actor: clean(req?.auth?.userId) || 'TO Administrator',
        actNo: docKey,
        signerId: signer.id,
        gmail: signer.email,
        ip: clean(req?.ip),
        userAgent: clean(req?.get?.('user-agent')),
        details: `module=TO; period=${label}; provider=${provider.hasHttpEmailProvider ? provider.provider : 'smtp'}; messageId=${providerMessageId || '-'}`,
      }).catch(() => {});
    } catch (emailError) {
      results.push({
        signer: signer.fullName,
        email: signer.email,
        gmail: signer.email,
        status: 'email-failed',
        approvalLinkCreated: true,
        code: emailError?.code || 'EMAIL_SEND_FAILED',
        error: emailError?.message || 'Email yuborish xatosi',
        providerStatus: emailError?.providerStatus || '',
        providerMessage: emailError?.providerMessage || '',
        responseCode: emailError?.responseCode,
        recommendedFix: emailError?.recommendedFix || '',
      });
      await appendAudit(current.config, {
        action: 'EMAIL_FAILED',
        actor: clean(req?.auth?.userId) || 'TO Administrator',
        actNo: docKey,
        signerId: signer.id,
        gmail: signer.email,
        ip: clean(req?.ip),
        userAgent: clean(req?.get?.('user-agent')),
        details: `module=TO; period=${label}; ${emailError?.code || 'EMAIL_SEND_FAILED'}: ${emailError?.message || 'Email yuborish xatosi'}`,
      }).catch(() => {});
    }
  }

  const sent = results.filter((row) => row.status === 'sent').length;
  const failed = results.filter((row) => row.status === 'email-failed').length;
  return {
    key: docKey,
    label,
    status: sent > 0 ? 'Кутилмоқда' : 'Email xatosi',
    provider: provider.hasHttpEmailProvider ? provider.provider : 'smtp',
    deliveryMode,
    fromMode: provider.hasHttpEmailProvider ? provider.fromMode : 'smtp',
    warning: provider.hasHttpEmailProvider ? (provider.warning || '') : '',
    recommendedFix: provider.hasHttpEmailProvider ? (provider.recommendedFix || '') : (smtpSummary?.recommendedFix || ''),
    total: signers.length,
    sent,
    approved: 0,
    failed,
    results,
  };
}

async function approvalContext(token, req, { markOpened = false } = {}) {
  const payload = verifyToPeriodApprovalToken(token);
  const workspace = await findWorkspaceById(payload.workspaceId);
  if (!workspace || workspace.status === 'archived') throw makeError('TO_APPROVAL_WORKSPACE_NOT_FOUND', 'Workspace topilmadi', '', 404);

  const bundle = await getToPeriodBundle(workspace.id, payload.year, payload.month);
  if (!bundle || clean(bundle.period.id) !== clean(payload.periodId)) {
    throw makeError('TO_PERIOD_NOT_FOUND', 'TO hujjati topilmadi', '', 404);
  }

  const docKey = periodKey(payload.year, payload.month);
  const current = await approvalRows(workspace, docKey);
  const approval = current.rows.find((row) => row.id === payload.approvalId && row.signerId === payload.signerId);
  if (!approval) throw makeError('TO_APPROVAL_NOT_FOUND', 'TO tasdiqlash yozuvi topilmadi', '', 404);
  if (clean(payload.email).toLowerCase() !== clean(approval.email).toLowerCase()) {
    throw makeError('TO_APPROVAL_RECIPIENT_MISMATCH', 'TO tasdiqlash havolasi imzolovchiga mos emas', '', 403);
  }
  if (!approval.tokenHash || approval.tokenHash !== sha256(token)) {
    throw makeError('TO_APPROVAL_LINK_REVOKED', 'TO tasdiqlash havolasi bekor qilingan yoki yangilangan', '', 403);
  }

  let next = approval;
  if (markOpened && !approval.openedAt) {
    next = await updateApprovalRow(workspace, approval, {
      openedAt: new Date().toISOString(),
      ip: clean(req?.ip),
      userAgent: clean(req?.get?.('user-agent')),
    });
  }

  if (markOpened) {
    await appendAudit(current.config, {
      action: 'DOCUMENT_OPENED',
      actor: next.fio,
      actNo: docKey,
      signerId: next.signerId,
      gmail: next.email,
      ip: clean(req?.ip),
      userAgent: clean(req?.get?.('user-agent')),
      details: `module=TO; period=${periodLabel(payload.year, payload.month)}`,
    }).catch(() => {});
  }

  return {
    payload,
    workspace,
    bundle,
    approval: next,
    approvals: activeApprovals(current.rows.map((row) => row.id === next.id ? { ...row, ...next } : row)),
    config: current.config,
    docKey,
  };
}

export async function openToPeriodApproval(token, req) {
  const context = await approvalContext(token, req, { markOpened: true });
  const csrfToken = createCsrfToken(context.approval.id, token);
  const baseUrl = baseUrlFromRequest(req);
  return {
    ...context,
    csrfToken,
    html: publicApprovalPage({ ...context, csrfToken, token, baseUrl }),
  };
}

export async function getToPeriodApprovalStatus(token) {
  const context = await approvalContext(token, null);
  return {
    approvalId: clean(context.approval.id),
    signerId: clean(context.approval.signerId),
    fio: clean(context.approval.fio),
    email: clean(context.approval.email),
    status: clean(context.approval.status),
    approvedAt: clean(context.approval.approvedAt),
    approved: clean(context.approval.status) === 'Тасдиқланди',
  };
}

export async function approveToPeriod(token, csrfToken, req) {
  const context = await approvalContext(token, req);
  verifyCsrfToken(csrfToken, context.approval.id, token);

  let approval = context.approval;
  if (approval.status !== 'Тасдиқланди') {
    approval = await updateApprovalRow(context.workspace, approval, {
      status: 'Тасдиқланди',
      openedAt: approval.openedAt || new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      ip: clean(req?.ip),
      userAgent: clean(req?.get?.('user-agent')),
    });

    await appendAudit(context.config, {
      action: 'DOCUMENT_APPROVED',
      actor: approval.fio,
      actNo: context.docKey,
      signerId: approval.signerId,
      gmail: approval.email,
      ip: clean(req?.ip),
      userAgent: clean(req?.get?.('user-agent')),
      details: `module=TO; period=${periodLabel(context.payload.year, context.payload.month)}`,
    }).catch(() => {});
  }

  const refreshed = activeApprovals((await approvalRows(context.workspace, context.docKey)).rows);
  const approvalSummary = summarizeToApprovals(refreshed);
  return {
    status: 'Тасдиқланди',
    alreadyApproved: context.approval.status === 'Тасдиқланди',
    approval,
    approvalSummary,
  };
}
