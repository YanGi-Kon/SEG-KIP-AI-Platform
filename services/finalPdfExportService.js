import { ensureSheet, extractSpreadsheetId, getSheetsClient } from './googleSheetsService.js';
import { resolveEnvServiceAccount } from './googleCredentialService.js';
import { findWorkspaceById } from '../repositories/workspaceRepository.js';
import {
  classifyWorkspaceDriveError,
  createWorkspaceDriveProvider,
  ensureWorkspaceDocumentsSubfolder,
} from './workspaceDriveFolderService.js';

const REGISTRY_SHEET = 'АКТЛАР_РЕЕСТР';
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
  'a4Json',
  'finalPdfFileId',
  'finalPdfUrl',
  'finalApprovedAt',
  'finalPdfStatus',
];

function clean(value) {
  return String(value ?? '').trim();
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

function safeFilePart(value, fallback = 'document') {
  return clean(value)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 160) || fallback;
}

function buildPdfFileName(actNo) {
  return `${safeFilePart(actNo, 'ACT')} - Tasdiqlangan.pdf`;
}

function wrapHtmlForPdf(html, actNo) {
  const body = clean(html) || `<div style="padding:24px;font-family:Arial,sans-serif"><h1>${safeFilePart(actNo, 'ACT')}</h1></div>`;
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>${safeFilePart(actNo, 'ACT')}</title><style>body{margin:0;padding:0;background:#ffffff;color:#111827;font-family:Arial,sans-serif}.pdf-wrap{padding:18px}.paper{background:#ffffff}.a4-preview{max-width:210mm;min-height:297mm;margin:0 auto;background:#fff;color:#111;padding:18mm;box-sizing:border-box;font-family:"Times New Roman",serif}img{max-width:100%;height:auto;display:inline-block}</style></head><body><div class="pdf-wrap">${body}</div></body></html>`;
}

function resolveServiceAccount() {
  const { serviceAccount } = resolveEnvServiceAccount();
  return serviceAccount;
}

function makeConfig(spreadsheetUrl, serviceAccount) {
  return {
    spreadsheetUrl: clean(spreadsheetUrl),
    serviceAccount,
  };
}

async function ensureRegistryHeaders(config) {
  const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);
  const sheets = await getSheetsClient(config.serviceAccount);
  const sheetId = await ensureSheet({ ...config, sheetName: REGISTRY_SHEET });
  const lastCol = colLetter(REGISTRY_HEADERS.length);
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${REGISTRY_SHEET}'!A1:${lastCol}1`,
  }).catch(() => ({ data: { values: [] } }));
  const header = current.data.values?.[0] || [];
  const needsHeader = REGISTRY_HEADERS.some((name, index) => clean(header[index]) !== name);
  if (needsHeader) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${REGISTRY_SHEET}'!A1:${lastCol}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [REGISTRY_HEADERS] },
    });
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: REGISTRY_HEADERS.length },
          },
        }],
      },
    }).catch(() => {});
  }
  return { sheets, spreadsheetId };
}

async function getRegistryDocument(config, actNo) {
  const { sheets, spreadsheetId } = await ensureRegistryHeaders(config);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${REGISTRY_SHEET}'!A:R`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const rows = result.data.values || [];
  const index = rows.findIndex((row, i) => i > 0 && clean(row[0]) === clean(actNo));
  if (index < 0) {
    throw new Error('Ҳужжат АКТЛАР_РЕЕСТР дан топилмади');
  }
  const row = rows[index];
  return {
    sheets,
    spreadsheetId,
    rowNumber: index + 1,
    actNo: row[0] || '',
    a4Html: row[12] || '',
    a4Json: row[13] || '',
    finalPdfFileId: row[14] || '',
    finalPdfUrl: row[15] || '',
    finalApprovedAt: row[16] || '',
    finalPdfStatus: row[17] || '',
  };
}

async function persistExportState(document, exportState) {
  await document.sheets.spreadsheets.values.update({
    spreadsheetId: document.spreadsheetId,
    range: `'${REGISTRY_SHEET}'!O${document.rowNumber}:R${document.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        clean(exportState.fileId),
        clean(exportState.url),
        clean(exportState.approvedAt),
        clean(exportState.status),
      ]],
    },
  });
}

async function resolveDocumentContext({ actNo, workspaceId = '' }) {
  if (!clean(workspaceId)) {
    const error = new Error('Approval token workspaceId saqlashi shart. Tenantlar bo‘yicha qidiruv taqiqlangan.');
    error.code = 'APPROVAL_WORKSPACE_CONTEXT_REQUIRED';
    error.statusCode = 400;
    throw error;
  }
  const serviceAccount = resolveServiceAccount();
  const workspace = await findWorkspaceById(clean(workspaceId));
  if (!workspace?.spreadsheetUrl) {
    const error = new Error('Final PDF export uchun workspace topilmadi yoki Sheet sozlanmagan.');
    error.code = 'WORKSPACE_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  const config = makeConfig(workspace.spreadsheetUrl, serviceAccount);
  const document = await getRegistryDocument(config, actNo);
  return { workspace, config, document };
}

export async function finalizeApprovedActExport({ actNo, updatedHtml = '', workspaceId = '' }) {
  const { workspace, document } = await resolveDocumentContext({ actNo, workspaceId });

  if (!workspace?.finalDocumentsFolderId) {
    const exportState = {
      status: 'EXPORT_SKIPPED_NO_FOLDER',
      fileId: clean(document.finalPdfFileId),
      url: clean(document.finalPdfUrl),
      approvedAt: clean(document.finalApprovedAt),
      errorCode: workspace ? 'FINAL_DOCUMENTS_FOLDER_ID_REQUIRED' : 'WORKSPACE_NOT_FOUND',
      errorMessage: workspace ? 'Yakuniy hujjatlar papkasi sozlanmagan.' : 'Workspace topilmadi yoki archived holatda.',
    };
    await persistExportState(document, exportState);
    console.info('[final-pdf-export]', { actNo: clean(actNo), workspaceId: clean(workspace?.id), folderId: '', exportStatus: exportState.status, errorCode: exportState.errorCode });
    return exportState;
  }

  if (clean(document.finalPdfStatus) === 'EXPORTED' && clean(document.finalPdfFileId)) {
    const exportState = {
      status: 'EXPORTED',
      fileId: clean(document.finalPdfFileId),
      url: clean(document.finalPdfUrl),
      approvedAt: clean(document.finalApprovedAt),
      skipped: true,
    };
    console.info('[final-pdf-export]', { actNo: clean(actNo), workspaceId: clean(workspace.id), folderId: clean(workspace.finalDocumentsFolderId), exportStatus: exportState.status, driveFileId: exportState.fileId });
    return exportState;
  }

  let provider = null;
  let tempDocId = '';
  try {
    provider = await createWorkspaceDriveProvider(workspace);
    await provider.validateFolder(workspace.finalDocumentsFolderId, { writeTest: false });
    const targetFolder = await ensureWorkspaceDocumentsSubfolder(workspace, {
      folderName: 'ХУЖАТЛАР',
      provider,
    });

    const pdfHtml = wrapHtmlForPdf(updatedHtml || document.a4Html, actNo);
    tempDocId = await provider.uploadHtmlAsTemporaryDocument(
      workspace.finalDocumentsFolderId,
      `TMP_${safeFilePart(actNo, 'ACT')}_${Date.now()}`,
      pdfHtml,
    );
    const pdfBuffer = await provider.exportDocumentToPdf(tempDocId);
    const uploaded = await provider.uploadPdf(targetFolder.folderId, buildPdfFileName(actNo), pdfBuffer);
    const fileId = clean(uploaded.fileId);
    const exportState = {
      status: 'EXPORTED',
      fileId,
      url: clean(uploaded.url),
      approvedAt: nowIso(),
      folderId: clean(workspace.finalDocumentsFolderId),
      documentsFolderId: targetFolder.folderId,
      workspaceId: clean(workspace.id),
    };
    await persistExportState(document, exportState);
    console.info('[final-pdf-export]', { actNo: clean(actNo), workspaceId: clean(workspace.id), folderId: exportState.folderId, exportStatus: exportState.status, driveFileId: exportState.fileId });
    return exportState;
  } catch (error) {
    const classified = classifyWorkspaceDriveError(error);
    const exportState = {
      status: 'EXPORT_FAILED',
      fileId: '',
      url: '',
      approvedAt: '',
      errorCode: classified.code,
      errorMessage: classified.message,
      recommendedFix: classified.recommendedFix || '',
      rawReason: classified.rawReason || '',
    };
    await persistExportState(document, exportState);
    console.error('[final-pdf-export]', { actNo: clean(actNo), workspaceId: clean(workspace?.id), folderId: clean(workspace?.finalDocumentsFolderId), exportStatus: exportState.status, errorCode: exportState.errorCode, serviceAccountEmail: provider?.serviceAccountEmail || '' });
    return exportState;
  } finally {
    if (tempDocId && provider) await provider.deleteTemporaryFile(tempDocId);
  }
}
