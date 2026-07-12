import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ensureSheet, extractSpreadsheetId, getSheetsClient } from './googleSheetsService.js';
import { resolveWorkspaceGoogleConfig } from './workspaceGoogleService.js';
import { findWorkspaceForSignedLink } from '../repositories/workspacePublicRepository.js';
import {
  createCsrfToken,
  renderApprovalPage,
  verifyCsrfToken,
} from './signatureApprovalService.js';

const APPROVALS_SHEET = 'ҲУЖЖАТ_ТАСДИҚЛАШ';
const REGISTRY_SHEET = 'АКТЛАР_РЕЕСТР';
const DAILY_SHEET = 'АКТЛАР_КУНЛИК';
const AUDIT_SHEET = 'АУДИТ_ЛОГ';
const APPROVAL_HEADERS = ['ID', 'ActNo', 'SignerID', 'Lavozimi', 'FIO', 'Gmail', 'Status', 'ApprovalLink', 'TokenHash', 'CreatedAt', 'OpenedAt', 'ApprovedAt', 'IP', 'UserAgent', 'SignatureFileId'];
const AUDIT_HEADERS = ['ID', 'Action', 'Actor', 'ActNo', 'SignerID', 'Gmail', 'DateTime', 'IP', 'UserAgent', 'Details'];

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

function approvalSecret() {
  const secret = clean(process.env.APPROVAL_JWT_SECRET);
  if (secret.length < 32) {
    const error = new Error('APPROVAL_JWT_SECRET kamida 32 belgidan iborat bo‘lishi kerak');
    error.code = 'APPROVAL_JWT_SECRET_INVALID';
    error.statusCode = 500;
    throw error;
  }
  return secret;
}

function verifyWorkspaceApprovalToken(token) {
  const payload = jwt.verify(token, approvalSecret(), {
    issuer: 'SEG-KIP-AI',
    audience: 'document-approval',
  });
  if (payload.type !== 'approval' || !payload.workspaceId) {
    const error = new Error('Workspace tasdiqlash tokeni noto‘g‘ri');
    error.code = 'WORKSPACE_APPROVAL_TOKEN_INVALID';
    error.statusCode = 403;
    throw error;
  }
  return payload;
}

async function workspaceConfig(workspaceId) {
  const workspace = await findWorkspaceForSignedLink(workspaceId);
  if (!workspace) {
    const error = new Error('Workspace topilmadi yoki arxivlangan');
    error.code = 'WORKSPACE_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  const config = await resolveWorkspaceGoogleConfig(workspace);
  return { workspace, config };
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

function approvalFromRow(row, rowNumber) {
  return {
    id: row[0] || '',
    actNo: row[1] || '',
    signerId: row[2] || '',
    position: row[3] || '',
    fio: row[4] || '',
    gmail: row[5] || '',
    status: row[6] || '',
    approvalLink: row[7] || '',
    tokenHash: row[8] || '',
    createdAt: row[9] || '',
    openedAt: row[10] || '',
    approvedAt: row[11] || '',
    ip: row[12] || '',
    userAgent: row[13] || '',
    signatureFileId: row[14] || '',
    rowNumber,
  };
}

async function listApprovals(config, actNo) {
  const { sheets, spreadsheetId } = await ensureApprovalSheet(config);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(APPROVALS_SHEET)}!A:O`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  return (result.data.values || [])
    .slice(1)
    .map((row, index) => approvalFromRow(row, index + 2))
    .filter((approval) => approval.id && (!actNo || approval.actNo === actNo));
}

async function findApproval(config, token, payload) {
  const approvals = await listApprovals(config, payload.actNo);
  const approval = approvals.find((item) => (
    item.id === payload.approvalId
    && item.signerId === payload.signerId
    && clean(item.gmail).toLowerCase() === clean(payload.email).toLowerCase()
  ));
  if (!approval || approval.tokenHash !== sha256(token)) {
    const error = new Error('Tasdiqlash havolasi bekor qilingan yoki yangilangan');
    error.code = 'WORKSPACE_APPROVAL_LINK_REVOKED';
    error.statusCode = 403;
    throw error;
  }
  return approval;
}

async function getDocument(config, actNo) {
  const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);
  const sheets = await getSheetsClient(config.serviceAccount);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(REGISTRY_SHEET)}!A:N`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const rows = result.data.values || [];
  const index = rows.findIndex((row, rowIndex) => rowIndex > 0 && clean(row[0]) === clean(actNo));
  if (index < 0) {
    const error = new Error('Hujjat АКТЛАР_РЕЕСТР dan topilmadi');
    error.code = 'WORKSPACE_DOCUMENT_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  const row = rows[index];
  return {
    rowNumber: index + 1,
    actNo: row[0] || '',
    status: row[4] || '',
    rowStart: Number(row[5]) || 0,
    date: row[7] || '',
    deviceName: row[8] || '',
    serialNo: row[9] || '',
    place: row[10] || '',
    executor: row[11] || '',
    a4Html: row[12] || '',
    a4Json: row[13] || '',
  };
}

async function updateApproval(config, approval) {
  const { sheets, spreadsheetId } = await ensureApprovalSheet(config);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${q(APPROVALS_SHEET)}!A${approval.rowNumber}:O${approval.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[
      approval.id,
      approval.actNo,
      approval.signerId,
      approval.position,
      approval.fio,
      approval.gmail,
      approval.status,
      approval.approvalLink,
      approval.tokenHash,
      approval.createdAt,
      approval.openedAt || '',
      approval.approvedAt || '',
      approval.ip || '',
      approval.userAgent || '',
      approval.signatureFileId || '',
    ]] },
  });
}

async function appendAudit(config, input) {
  const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);
  const sheets = await getSheetsClient(config.serviceAccount);
  await ensureSheet({ ...config, sheetName: AUDIT_SHEET });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${q(AUDIT_SHEET)}!A1:J1`,
    valueInputOption: 'RAW',
    requestBody: { values: [AUDIT_HEADERS] },
  });
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${q(AUDIT_SHEET)}!A:J`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[
      `AUD_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      clean(input.action),
      clean(input.actor),
      clean(input.actNo),
      clean(input.signerId),
      clean(input.gmail),
      nowIso(),
      clean(input.ip),
      clean(input.userAgent),
      clean(input.details),
    ]] },
  }).catch(() => {});
}

async function updateDocumentStatus(config, document, approvals) {
  const total = approvals.length;
  const approved = approvals.filter((item) => item.status === 'Тасдиқланди').length;
  const status = total > 0 && approved === total
    ? 'Тасдиқланди'
    : approved > 0
      ? 'Қисман тасдиқланди'
      : 'Кутилмоқда';
  const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);
  const sheets = await getSheetsClient(config.serviceAccount);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${q(REGISTRY_SHEET)}!E${document.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[status]] },
  });
  if (document.rowStart) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${q(DAILY_SHEET)}!K${document.rowStart}:L${document.rowStart + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [
        ['Status', 'ApprovedAt'],
        [status, nowIso()],
      ] },
    }).catch(() => {});
  }
  return { status, approved, total };
}

export function isWorkspaceApprovalToken(token) {
  const payload = jwt.decode(String(token || ''));
  return Boolean(payload?.workspaceId && payload?.type === 'approval');
}

export async function openWorkspaceApproval(token, req) {
  const payload = verifyWorkspaceApprovalToken(token);
  const { workspace, config } = await workspaceConfig(payload.workspaceId);
  const approval = await findApproval(config, token, payload);
  const document = await getDocument(config, approval.actNo);
  if (!approval.openedAt) {
    approval.openedAt = nowIso();
    approval.ip = req.ip || '';
    approval.userAgent = req.get('user-agent') || '';
    await updateApproval(config, approval);
  }
  await appendAudit(config, {
    action: 'DOCUMENT_OPENED',
    actor: approval.fio,
    actNo: approval.actNo,
    signerId: approval.signerId,
    gmail: approval.gmail,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    details: `workspace:${workspace.id}`,
  });
  return {
    approval,
    document,
    csrfToken: createCsrfToken(approval.id, token),
    workspace: { id: workspace.id, name: workspace.name },
  };
}

export async function approveWorkspaceDocument(token, csrfToken, req) {
  const payload = verifyWorkspaceApprovalToken(token);
  const { workspace, config } = await workspaceConfig(payload.workspaceId);
  const approval = await findApproval(config, token, payload);
  verifyCsrfToken(csrfToken, approval.id, token);
  if (approval.status !== 'Тасдиқланди') {
    approval.status = 'Тасдиқланди';
    approval.approvedAt = nowIso();
    approval.ip = req.ip || approval.ip || '';
    approval.userAgent = req.get('user-agent') || approval.userAgent || '';
    await updateApproval(config, approval);
    await appendAudit(config, {
      action: 'DOCUMENT_APPROVED',
      actor: approval.fio,
      actNo: approval.actNo,
      signerId: approval.signerId,
      gmail: approval.gmail,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      details: `workspace:${workspace.id}`,
    });
  }
  const document = await getDocument(config, approval.actNo);
  const approvals = await listApprovals(config, approval.actNo);
  const state = await updateDocumentStatus(config, document, approvals);
  return {
    approval,
    ...state,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
  };
}

export function renderWorkspaceApprovalPage(data, token) {
  return renderApprovalPage(data, token);
}
