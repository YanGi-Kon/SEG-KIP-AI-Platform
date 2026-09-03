import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../routes/signatures.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../services/finalPdfExportWorker.js', import.meta.url), 'utf8');
const repository = fs.readFileSync(new URL('../repositories/outboxRepository.js', import.meta.url), 'utf8');
const appsScript = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');

test('Gmail approval processes the exact outbox job that it just enqueued', () => {
  assert.match(route, /updatedHtml: result\.updatedHtml \|\| ''/);
  assert.match(route, /processFinalPdfExportById\(job\.id, `approval-\$\{process\.pid\}`\)/);
  assert.doesNotMatch(route, /processNextFinalPdfExport\(`approval-/);
  assert.match(worker, /claimFinalPdfExportById\(jobId, workerId\)/);
  assert.match(repository, /WHERE id = \$1[\s\S]*job_type = 'final_pdf_export'/);
});

test('Apps Script uploads ready PDF bytes without Google Docs conversion', () => {
  assert.match(appsScript, /function uploadPdfBase64_\(payload\)/);
  assert.match(appsScript, /Utilities\.base64Decode\(encoded\)/);
  assert.match(appsScript, /Utilities\.newBlob\(bytes, 'application\/pdf', name\)/);
  assert.match(appsScript, /action === 'upload_pdf_base64'/);
  assert.doesNotMatch(appsScript, /renderAndUploadPdf_|Drive\.Files\.create|MimeType\.PDF/);
  assert.match(appsScript, /size: bytes\.length/);
  assert.match(appsScript, /DRIVE_PDF_UPLOAD_FAILED/);
});
