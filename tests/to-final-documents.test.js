import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const toModule = fs.readFileSync(new URL('../public/modules/to.html', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../public/js/to-period-sheet-bridge.js', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('../public/js/to-final-documents-panel.js', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../routes/toPeriodSheetBridge.js', import.meta.url), 'utf8');
const email = fs.readFileSync(new URL('../services/toPeriodEmailDeliveryService.js', import.meta.url), 'utf8');
const approval = fs.readFileSync(new URL('../services/toPeriodApprovalService.js', import.meta.url), 'utf8');
const exportService = fs.readFileSync(new URL('../services/toPeriodFinalPdfExportService.js', import.meta.url), 'utf8');
const outbox = fs.readFileSync(new URL('../repositories/outboxRepository.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../services/finalPdfExportWorker.js', import.meta.url), 'utf8');
const periodRepo = fs.readFileSync(new URL('../repositories/toPeriodRepository.js', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../services/pdfRendererService.js', import.meta.url), 'utf8');

test('TO toolbar contains 6. ЯКУНИЙ ҲУЖЖАТЛАР and loads its panel', () => {
  assert.match(toModule, /id="toFinalDocumentsBtn"/);
  assert.match(toModule, />6\. ЯКУНИЙ ҲУЖЖАТЛАР<\/button>/);
  assert.match(bridge, /loadFinalDocumentsPanel/);
  assert.match(bridge, /to-final-documents-panel\.js\?v=to-final2-export/);
  assert.match(panel, /<h2>6\. ЯКУНИЙ ҲУЖЖАТЛАР<\/h2>/);
});

test('TO final documents panel reuses workspace final Drive folder mechanism', () => {
  assert.match(panel, /\/documents\/final-folder/);
  assert.match(panel, /\/documents\/final-folder\/test/);
  assert.match(panel, /finalDocumentsFolderId/);
  assert.match(panel, /ХУЖАТЛАР/);
  assert.match(panel, /tryFinalizeCurrentPeriod/);
});

test('TO approval email requires final documents folder preflight like Acts', () => {
  assert.match(email, /testWorkspaceFinalDocumentsFolder/);
  assert.match(email, /writeTest: false/);
});

test('TO final PDF is queued only after all signer slots are complete', () => {
  assert.match(route, /queueToFinalPdfIfReady/);
  assert.match(route, /missingSignerSlots > 0 \|\| unsignedApprovers > 0/);
  assert.match(route, /WAITING_SIGNATURES/);
  assert.match(route, /enqueueToFinalPdfExport/);
  assert.match(route, /processFinalPdfExportById/);
  assert.match(route, /router\.post\('\/reports\/:year\/:month\/finalize'/);
  assert.match(route, /finalPdfExport = await queueToFinalPdfIfReady/);
  assert.match(approval, /workspaceId: context\.workspace\.id/);
});

test('TO final PDF exporter writes signed A4 PDF into Drive ХУЖАТЛАР', () => {
  assert.match(exportService, /finalizeApprovedToPeriodExport/);
  assert.match(exportService, /getToPeriodReport/);
  assert.match(exportService, /unsignedApprovers/);
  assert.match(exportService, /missingSignerSlots/);
  assert.match(exportService, /ensureWorkspaceDocumentsSubfolder/);
  assert.match(exportService, /folderName: 'ХУЖАТЛАР'/);
  assert.match(exportService, /inlinePdfSignatureImages/);
  assert.match(exportService, /renderHtmlToA4Pdf\(inlined\.html, \{ allowMultiPage: true \}\)/);
  assert.match(exportService, /uploadPdf/);
  assert.match(exportService, /status: 'EXPORTED'/);
});

test('TO final PDF export state is persisted and period becomes completed', () => {
  assert.match(periodRepo, /updateToPeriodFinalPdfState/);
  assert.match(periodRepo, /jsonb_build_object\('finalPdf', \$3::jsonb\)/);
  assert.match(periodRepo, /status = CASE WHEN \$4::boolean THEN 'completed'/);
  assert.match(approval, /finalPdf: bundle\.period\?\.sourceSnapshot\?\.finalPdf/);
});

test('TO final PDF uses outbox worker and can retry failed jobs', () => {
  assert.match(outbox, /enqueueToFinalPdfExport/);
  assert.match(outbox, /final-pdf-to:/);
  assert.match(outbox, /module: 'TO'/);
  assert.match(worker, /finalizeApprovedToPeriodExport/);
  assert.match(worker, /job\.payload\?\.module/);
  assert.match(outbox, /ELSE 'pending'/);
});

test('PDF renderer keeps Acts single-page default but allows TO multi-page A4', () => {
  assert.match(renderer, /if \(!options\.allowMultiPage\) await fitSingleA4Page\(page\)/);
  assert.match(renderer, /if \(!options\.allowMultiPage && inspection\.pageCount !== 1\)/);
});
