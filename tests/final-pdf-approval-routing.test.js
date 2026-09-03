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

test('Apps Script retries Google Doc to PDF conversion and verifies bytes', () => {
  assert.match(appsScript, /for \(var attempt = 0; attempt < 4; attempt \+= 1\)/);
  assert.match(appsScript, /pdfBlob\.getBytes\(\)\.length > 0/);
  assert.match(appsScript, /DRIVE_PDF_UPLOAD_FAILED/);
});
