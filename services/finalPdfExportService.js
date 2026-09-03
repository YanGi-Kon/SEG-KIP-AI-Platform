import { ensureSheet, extractSpreadsheetId, getSheetsClient } from './googleSheetsService.js';
import { findWorkspaceById } from '../repositories/workspaceRepository.js';
import { resolveWorkspaceGoogleConfig } from './workspaceGoogleService.js';
import { loadSignatureImage } from './signatureApprovalService.js';
import { inlinePdfSignatureImages, renderHtmlToA4Pdf } from './pdfRendererService.js';
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

export function buildPdfFileName(actNo) {
  return `${safeFilePart(actNo, 'ACT')} - Tasdiqlangan.pdf`;
}

export function wrapHtmlForPdf(html, actNo) {
  const body = clean(html) || `<div style="padding:24px;font-family:Arial,sans-serif"><h1>${safeFilePart(actNo, 'ACT')}</h1></div>`;
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>${safeFilePart(actNo, 'ACT')}</title><style>
@page{size:A4 portrait;margin:8mm}
html,body{margin:0;padding:0;width:100%;background:#fff;color:#111;font-family:"Times New Roman","Liberation Serif",serif;font-size:9.5pt;line-height:1.08}
*{box-sizing:border-box}
.pdf-wrap{margin:0;padding:0;width:100%}
.paper{background:#fff}
.a4-preview{width:100%;max-width:none;min-height:0;margin:0;padding:6mm 10mm;background:#fff;color:#111;font-family:"Times New Roman","Liberation Serif",serif;font-size:9.5pt;line-height:1.08;box-shadow:none}
.act-meta{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin:0 0 5mm}
.act-date-head{font-size:8.5pt;padding-top:18mm;white-space:nowrap}
.act-date-head .line{display:inline-block;min-width:26px;border-bottom:1px solid #111;text-align:center;line-height:1;padding:0 2px 1px}
.act-date-head .month,.act-date-head .year{color:#1d4ed8;font-style:italic}
.right{text-align:right;color:#1d4ed8;font-size:8.5pt;line-height:1.08;font-weight:700;max-width:88mm;margin-left:auto;white-space:pre-line}
.act-head{margin-bottom:5mm;text-align:center}
.act-title{display:flex;justify-content:center;align-items:flex-end;gap:7px;font-size:14pt;font-weight:700;line-height:1.05;margin:0 0 3px}
.act-title .act-no-line{display:inline-flex;align-items:flex-end;justify-content:center;min-width:82px;padding:0 6px 2px;border-bottom:1px solid #111}
.act-subtitle{text-align:center;font-size:10.5pt;font-weight:700}
.act-signers-title{font-weight:700;font-size:10pt;margin:0 0 5px}
.act-signers{display:grid;gap:7px;margin-bottom:10px}
.act-signers-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:end}
.act-signers-cell{text-align:center;min-width:0}
.act-signers-value{position:relative;min-height:18px;padding:0 2px 1px;border-bottom:1px solid #111;display:flex;align-items:flex-end;justify-content:center}
.act-signers .act-signature-box{display:none!important}
.act-signers-label,.act-final-signature-label{font-size:8pt;line-height:1;margin-top:2px}
.act-section{margin-top:10px;break-inside:avoid;page-break-inside:avoid}
.act-section-title{font-size:10pt;font-weight:700;margin-bottom:3px}
.act-section-value{min-height:18px;padding:0 1px 3px;border-bottom:1px solid #111;white-space:pre-wrap;word-break:break-word}
.act-section-value.tall{min-height:50px}
.act-section-value.xl{min-height:68px}
.act-date-inline{display:flex;justify-content:flex-end;align-items:flex-end;gap:6px;font-size:8pt;font-weight:700;margin-top:2px}
.act-date-inline .line{display:inline-flex;justify-content:center;min-width:105px;border-bottom:1px solid #111;padding-bottom:1px;font-weight:400}
.act-conclusion{margin-top:10px}
.act-final-signatures{margin-top:10px;break-inside:avoid;page-break-inside:avoid}
.act-final-signatures-title{font-size:10pt;font-weight:700;margin-bottom:5px}
.act-final-signatures-grid{display:grid;gap:9px}
.act-final-signature-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:end}
.act-final-signature-cell{text-align:center;min-width:0}
.act-final-signature-value{position:relative;min-height:47px;padding:0 2px 1px;border-bottom:1px solid #111;display:flex;align-items:flex-end;justify-content:center;word-break:break-word}
.act-signature-box{position:absolute;left:50%;bottom:-1px;transform:translateX(-50%);width:115px;height:44px;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;pointer-events:none}
.act-signature-box img{display:block;width:100%;height:100%;object-fit:contain;object-position:center bottom}
img{max-width:100%;height:auto;display:inline-block}
body.pdf-density-compact .a4-preview{padding:5mm 8mm}
body.pdf-density-compact .act-meta{margin-bottom:3mm}
body.pdf-density-compact .act-date-head{padding-top:13mm}
body.pdf-density-compact .act-head{margin-bottom:3mm}
body.pdf-density-compact .act-signers{gap:5px;margin-bottom:7px}
body.pdf-density-compact .act-section{margin-top:7px}
body.pdf-density-compact .act-section-value.tall{min-height:38px}
body.pdf-density-compact .act-section-value.xl{min-height:50px}
body.pdf-density-compact .act-final-signatures{margin-top:7px}
body.pdf-density-compact .act-final-signatures-grid{gap:5px}
body.pdf-density-tight .a4-preview{padding:4mm 7mm;font-size:9pt;line-height:1.04}
body.pdf-density-tight .act-date-head{padding-top:9mm}
body.pdf-density-tight .act-meta,body.pdf-density-tight .act-head{margin-bottom:2mm}
body.pdf-density-tight .act-signers{gap:3px;margin-bottom:5px}
body.pdf-density-tight .act-section{margin-top:5px}
body.pdf-density-tight .act-section-title{margin-bottom:1px}
body.pdf-density-tight .act-section-value.tall{min-height:30px}
body.pdf-density-tight .act-section-value.xl{min-height:40px}
body.pdf-density-tight .act-final-signatures{margin-top:5px}
body.pdf-density-tight .act-final-signatures-title{margin-bottom:3px}
body.pdf-density-tight .act-final-signatures-grid{gap:3px}
</style></head><body><div class="pdf-wrap">${body}</div></body></html>`;
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
  const workspace = await findWorkspaceById(clean(workspaceId));
  if (!workspace?.spreadsheetUrl) {
    const error = new Error('Final PDF export uchun workspace topilmadi yoki Sheet sozlanmagan.');
    error.code = 'WORKSPACE_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  const workspaceGoogleConfig = resolveWorkspaceGoogleConfig(workspace);
  const config = makeConfig(workspaceGoogleConfig.spreadsheetUrl, workspaceGoogleConfig.serviceAccount);
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
  try {
    provider = await createWorkspaceDriveProvider(workspace);
    await provider.validateFolder(workspace.finalDocumentsFolderId, { writeTest: false });
    const targetFolder = await ensureWorkspaceDocumentsSubfolder(workspace, {
      folderName: 'ХУЖАТЛАР',
      provider,
    });

    const pdfHtml = wrapHtmlForPdf(updatedHtml || document.a4Html, actNo);
    const inlined = await inlinePdfSignatureImages(pdfHtml, { imageResolver: loadSignatureImage });
    const pdfBuffer = await renderHtmlToA4Pdf(inlined.html);
    const uploaded = await provider.uploadPdf(
      targetFolder.folderId,
      buildPdfFileName(actNo),
      pdfBuffer,
    );
    const fileId = clean(uploaded.fileId);
    if (!fileId) {
      const error = new Error('Drive PDF upload haqiqiy fileId qaytarmadi.');
      error.code = 'DRIVE_UPLOAD_RESULT_INVALID';
      error.statusCode = 502;
      throw error;
    }
    const exportState = {
      status: 'EXPORTED',
      fileId,
      url: clean(uploaded.url),
      size: Number(uploaded.size || pdfBuffer.length),
      approvedAt: nowIso(),
      folderId: clean(workspace.finalDocumentsFolderId),
      documentsFolderId: targetFolder.folderId,
      workspaceId: clean(workspace.id),
    };
    if (!exportState.size) {
      const error = new Error('Drive PDF upload nol baytli natija qaytardi.');
      error.code = 'DRIVE_UPLOAD_RESULT_INVALID';
      error.statusCode = 502;
      throw error;
    }
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
    console.error('[final-pdf-export]', { actNo: clean(actNo), workspaceId: clean(workspace?.id), folderId: clean(workspace?.finalDocumentsFolderId), exportStatus: exportState.status, errorCode: exportState.errorCode, serviceAccountEmail: provider?.serviceAccountEmail || '' });
    return exportState;
  }
}
