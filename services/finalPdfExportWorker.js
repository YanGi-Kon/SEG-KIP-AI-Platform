import crypto from 'node:crypto';
import { isDatabaseConfigured } from '../db/pool.js';
import {
  claimFinalPdfExportById,
  claimNextFinalPdfExport,
  completeFinalPdfExport,
  failFinalPdfExport,
} from '../repositories/outboxRepository.js';
import { finalizeApprovedActExport } from './finalPdfExportService.js';

const PERMANENT_ERRORS = new Set([
  'APPROVAL_WORKSPACE_CONTEXT_REQUIRED',
  'WORKSPACE_NOT_FOUND',
  'FINAL_DOCUMENTS_FOLDER_ID_REQUIRED',
  'DRIVE_SHARED_DRIVE_REQUIRED',
  'DRIVE_FOLDER_NOT_FOUND',
  'DRIVE_FOLDER_NOT_A_FOLDER',
  'DRIVE_WRITE_PERMISSION_DENIED',
  'DRIVE_API_DISABLED',
  'GOOGLE_SERVICE_ACCOUNT_INVALID',
  'DRIVE_APPS_SCRIPT_CONFIG_REQUIRED',
  'DRIVE_APPS_SCRIPT_AUTH_FAILED',
  'DRIVE_APPS_SCRIPT_DEPLOYMENT_NOT_FOUND',
  'DRIVE_APPS_SCRIPT_REQUEST_EXPIRED',
  'DRIVE_APPS_SCRIPT_REPLAY_REJECTED',
  'DRIVE_PDF_BASE64_REQUIRED',
  'DRIVE_PDF_BASE64_INVALID',
  'DRIVE_PDF_BYTES_EMPTY',
  'DRIVE_PDF_MIME_TYPE_INVALID',
  'DRIVE_PDF_SIGNATURE_INVALID',
  'FINAL_PDF_BYTES_EMPTY',
  'FINAL_PDF_CHROMIUM_NOT_FOUND',
  'FINAL_PDF_CONTENT_OVERFLOW',
  'FINAL_PDF_PAGE_COUNT_INVALID',
  'FINAL_PDF_PAGE_SIZE_INVALID',
  'FINAL_PDF_SIGNATURE_IMAGE_INVALID',
  'FINAL_PDF_SIGNATURE_IMAGE_SOURCE_UNSUPPORTED',
  'FINAL_PDF_SIGNATURE_INVALID',
  'WORKSPACE_ENCRYPTION_KEY_REQUIRED',
  'WORKSPACE_SECRET_INVALID',
  'WORKSPACE_SECRET_DECRYPT_FAILED',
]);

let timer = null;
let running = false;

export function isRetryableFinalPdfError(error) {
  return !PERMANENT_ERRORS.has(String(error?.code || ''));
}

async function processClaimedFinalPdfExport(job) {
  if (!job) return null;
  try {
    const result = await finalizeApprovedActExport(job.payload);
    if (result?.status === 'EXPORTED') {
      return completeFinalPdfExport(job.id, result);
    }
    const error = new Error(result?.errorMessage || 'Final PDF export failed');
    error.code = result?.errorCode || 'FINAL_PDF_EXPORT_FAILED';
    throw error;
  } catch (error) {
    return failFinalPdfExport(job, error, { retryable: isRetryableFinalPdfError(error) });
  }
}

export async function processNextFinalPdfExport(workerId = `final-pdf-${crypto.randomUUID()}`) {
  return processClaimedFinalPdfExport(await claimNextFinalPdfExport(workerId));
}

export async function processFinalPdfExportById(jobId, workerId = `final-pdf-${crypto.randomUUID()}`) {
  return processClaimedFinalPdfExport(await claimFinalPdfExportById(jobId, workerId));
}

export function startFinalPdfExportWorker() {
  if (timer || !isDatabaseConfigured()) return false;
  if (String(process.env.OUTBOX_WORKER_ENABLED || '').toLowerCase() !== 'true') return false;
  const intervalMs = Math.max(1000, Number(process.env.FINAL_PDF_WORKER_INTERVAL_MS || 5000));
  const workerId = `final-pdf-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      while (await processNextFinalPdfExport(workerId)) {
        // Drain the currently due queue serially; database row locks prevent duplicate workers.
      }
    } catch (error) {
      console.error('[final-pdf-worker]', { code: error?.code, message: error?.message });
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref?.();
  return true;
}

export function stopFinalPdfExportWorker() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
