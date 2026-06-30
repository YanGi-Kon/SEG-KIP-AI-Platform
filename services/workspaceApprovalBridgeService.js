import { ensureSheet, extractSpreadsheetId, getSheetsClient } from './googleSheetsService.js';
import { resolveWorkspaceGoogleConfig } from './workspaceGoogleService.js';
import { sendDocumentForApproval } from './signatureApprovalService.js';
import { listWorkspaceSigners } from '../repositories/workspaceSignerRepository.js';

const SIGNERS_SHEET = 'ИМЗО_ЧЕКУВЧИЛАР';
const SIGNER_HEADERS = ['ID', 'Lavozimi', 'FIO', 'ImzoPNG', 'Gmail', 'CreatedAt'];

function clean(value) {
  return String(value ?? '').trim();
}

function q(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

function signatureValue(signer) {
  const fileId = clean(signer.signatureFileId);
  if (fileId) return fileId;
  return clean(signer.signatureUrl);
}

function pinLegacyApprovalToWorkspace(config) {
  // The legacy approval service reads GOOGLE_SPREADSHEET_URL for public approval links.
  // In workspace mode, keep it pinned to the selected workspace sheet to avoid stale env sheet IDs.
  if (config?.spreadsheetUrl) process.env.GOOGLE_SPREADSHEET_URL = config.spreadsheetUrl;
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
  return { config, signersCount: rows.length };
}

export async function sendWorkspaceDocumentForApproval(workspace, input, req) {
  const { config, signersCount } = await syncWorkspaceSignersToSheet(workspace);
  if (!signersCount) throw new Error('Бу объект учун актив имзо чекувчилар йўқ');
  pinLegacyApprovalToWorkspace(config);
  try {
    const result = await sendDocumentForApproval({
      spreadsheetUrl: config.spreadsheetUrl,
      serviceAccount: config.serviceAccount,
    }, input, req);
    return {
      ...result,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      signersSource: 'workspace_signers',
      signersSynced: signersCount,
    };
  } catch (error) {
    if (/Requested entity was not found/i.test(error?.message || '')) {
      throw new Error('Workspace Google Sheet topilmadi yoki Railway GOOGLE_SPREADSHEET_URL eskirgan. Sahifani Ctrl+F5 qiling va qayta urinib ko‘ring.');
    }
    throw error;
  }
}
