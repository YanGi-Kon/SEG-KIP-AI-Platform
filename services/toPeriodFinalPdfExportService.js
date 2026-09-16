import { findWorkspaceById } from '../repositories/workspaceRepository.js';
import { getToPeriodBundle, updateToPeriodFinalPdfState } from '../repositories/toPeriodRepository.js';
import { loadSignatureImage } from './signatureApprovalService.js';
import { inlinePdfSignatureImages, renderHtmlToA4Pdf } from './pdfRendererService.js';
import {
  classifyWorkspaceDriveError,
  createWorkspaceDriveProvider,
  ensureWorkspaceDocumentsSubfolder,
} from './workspaceDriveFolderService.js';
import { getToPeriodReport } from './toPeriodApprovalService.js';

function clean(value) {
  return String(value ?? '').trim();
}

function nowIso() {
  return new Date().toISOString();
}

function safeFilePart(value, fallback = 'TO') {
  return clean(value)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 160) || fallback;
}

export function buildToFinalPdfFileName(year, month) {
  return `${safeFilePart(`TO-${Number(year)}-${String(Number(month)).padStart(2, '0')}`)} - Tasdiqlangan.pdf`;
}

export function wrapToPeriodHtmlForPdf(report = {}) {
  const title = safeFilePart(report.key || report.label || 'TO');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title><style>
html,body{margin:0;padding:0;background:#fff;color:#111}
*{box-sizing:border-box}
${String(report.a4Css || '')}
.to-a4-document{margin:0 auto;box-shadow:none}
@media print{.to-a4-document{box-shadow:none}}
</style></head><body>${String(report.a4Html || '')}</body></html>`;
}

async function persistState(workspaceId, periodId, state, { complete = false } = {}) {
  await updateToPeriodFinalPdfState(workspaceId, periodId, state, { complete });
  return state;
}

export async function finalizeApprovedToPeriodExport({ workspaceId = '', year, month } = {}) {
  const wsId = clean(workspaceId);
  const workspace = wsId ? await findWorkspaceById(wsId) : null;
  if (!workspace || workspace.status === 'archived') {
    const error = new Error('TO final PDF export uchun workspace topilmadi.');
    error.code = 'WORKSPACE_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const bundle = await getToPeriodBundle(workspace.id, year, month);
  if (!bundle) {
    const error = new Error('TO davri topilmadi.');
    error.code = 'TO_PERIOD_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const previous = bundle.period?.sourceSnapshot?.finalPdf || {};
  if (clean(previous.status) === 'EXPORTED' && clean(previous.fileId)) {
    return { ...previous, skipped: true };
  }

  const report = await getToPeriodReport(workspace, year, month);
  if (Number(report.missingSignerSlots || 0) > 0 || Number(report.unsignedApprovers || 0) > 0) {
    const error = new Error('TO yakuniy PDF uchun barcha 7 ta imzo tayyor bo‘lishi shart.');
    error.code = 'TO_FINAL_PDF_NOT_READY';
    error.statusCode = 409;
    error.details = {
      missingSignerSlots: Number(report.missingSignerSlots || 0),
      unsignedApprovers: Number(report.unsignedApprovers || 0),
    };
    throw error;
  }

  if (!clean(workspace.finalDocumentsFolderId)) {
    return persistState(workspace.id, bundle.period.id, {
      status: 'EXPORT_SKIPPED_NO_FOLDER',
      fileId: clean(previous.fileId),
      url: clean(previous.url),
      approvedAt: clean(previous.approvedAt),
      errorCode: 'FINAL_DOCUMENTS_FOLDER_ID_REQUIRED',
      errorMessage: 'Yakuniy hujjatlar papkasi sozlanmagan.',
    });
  }

  let provider = null;
  try {
    provider = await createWorkspaceDriveProvider(workspace);
    await provider.validateFolder(workspace.finalDocumentsFolderId, { writeTest: false });
    const targetFolder = await ensureWorkspaceDocumentsSubfolder(workspace, {
      folderName: 'ХУЖАТЛАР',
      provider,
    });

    const pdfHtml = wrapToPeriodHtmlForPdf(report);
    const inlined = await inlinePdfSignatureImages(pdfHtml, { imageResolver: loadSignatureImage });
    const pdfBuffer = await renderHtmlToA4Pdf(inlined.html, { allowMultiPage: true });
    const uploaded = await provider.uploadPdf(
      targetFolder.folderId,
      buildToFinalPdfFileName(year, month),
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
      documentsFolderId: clean(targetFolder.folderId),
      workspaceId: clean(workspace.id),
      year: Number(year),
      month: Number(month),
      signerCount: Number(report.signedApprovers || 0),
      pageMode: 'A4-multipage',
    };
    if (!exportState.size) {
      const error = new Error('Drive PDF upload nol baytli natija qaytardi.');
      error.code = 'DRIVE_UPLOAD_RESULT_INVALID';
      error.statusCode = 502;
      throw error;
    }
    await persistState(workspace.id, bundle.period.id, exportState, { complete: true });
    console.info('[to-final-pdf-export]', {
      workspaceId: workspace.id,
      year: Number(year),
      month: Number(month),
      exportStatus: exportState.status,
      driveFileId: exportState.fileId,
    });
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
      year: Number(year),
      month: Number(month),
    };
    await persistState(workspace.id, bundle.period.id, exportState).catch(() => {});
    console.error('[to-final-pdf-export]', {
      workspaceId: workspace.id,
      year: Number(year),
      month: Number(month),
      exportStatus: exportState.status,
      errorCode: exportState.errorCode,
      serviceAccountEmail: provider?.serviceAccountEmail || '',
    });
    return exportState;
  }
}
