import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridgeRoute = fs.readFileSync(new URL('../routes/toPeriodSheetBridge.js', import.meta.url), 'utf8');
const reportService = fs.readFileSync(new URL('../services/toPeriodApprovalService.js', import.meta.url), 'utf8');
const reportUi = fs.readFileSync(new URL('../public/js/to-reports-panel.js', import.meta.url), 'utf8');
const periodBridge = fs.readFileSync(new URL('../public/js/to-period-sheet-bridge.js', import.meta.url), 'utf8');

test('TO reports oy papkalari va A4 preview endpointlari bilan ulangan', () => {
  assert.match(bridgeRoute, /router\.get\('\/reports'/);
  assert.match(bridgeRoute, /router\.get\('\/reports\/:year\/:month'/);
  assert.match(reportService, /renderToPeriodA4/);
  assert.match(reportUi, /3\. Хисоботлар/);
  assert.match(reportUi, /📁/);
  assert.match(reportUi, /to-reports-a4-host/);
});

test('TO tayyor hujjat barcha faol imzolovchilarga individual yangi approval havola bilan yuboriladi', () => {
  assert.match(bridgeRoute, /router\.post\('\/reports\/:year\/:month\/send'/);
  assert.match(bridgeRoute, /requireToSend/);
  assert.match(reportService, /listWorkspaceSigners/);
  assert.match(reportService, /sendHttpEmail/);
  assert.match(reportService, /sendSafeEmail/);
  assert.match(reportService, /audience: 'to-period-approval'/);
  assert.match(reportService, /resetExisting: true/);
  assert.match(reportService, /oldingi havola bekor qilinadi/);
  assert.match(reportUi, /Хужатни юбориш/);
});

test('TO approval public link per-recipient status va CSRF bilan himoyalangan', () => {
  assert.match(bridgeRoute, /router\.get\('\/approve\/:token'/);
  assert.match(bridgeRoute, /router\.get\('\/approve\/status\/:token'/);
  assert.match(bridgeRoute, /router\.post\('\/approve'/);
  assert.match(bridgeRoute, /req\.body\?\.csrfToken/);
  assert.match(reportService, /getToPeriodApprovalStatus/);
  assert.match(reportService, /createCsrfToken/);
  assert.match(reportService, /verifyCsrfToken/);
  assert.match(reportService, /TO_APPROVAL_LINK_REVOKED/);
  assert.match(reportService, /pageshow/);
});

test('TO A4 approvaldan keyin haqiqiy PNG imzoni secure render endpoint orqali ko‘rsatadi', () => {
  assert.match(reportService, /createSignatureImageToken/);
  assert.match(reportService, /\/api\/signature\/render\//);
  assert.match(reportService, /to-a4-signature-image/);
  assert.match(reportService, /Кутилмоқда/);
  assert.match(reportService, /approvalSummary/);
  assert.match(reportUi, /approvalSummary/);
});

test('TO yuborish natijasida provider message ID va audit izlari qaytadi', () => {
  assert.match(reportService, /providerMessageId/);
  assert.match(reportService, /DOCUMENT_SENT/);
  assert.match(reportService, /EMAIL_FAILED/);
  assert.match(reportService, /DOCUMENT_OPENED/);
  assert.match(reportService, /DOCUMENT_APPROVED/);
  assert.match(reportUi, /showDeliveryTrace/);
});

test('TO module reports va signers panellarini runtime cache-bust bilan yuklaydi', () => {
  assert.match(periodBridge, /to-signers-panel\.js/);
  assert.match(periodBridge, /to-reports-panel\.js\?v=to-reports-full-approval-2/);
  assert.match(periodBridge, /toOpenPeriodBtn'\)\?\.remove/);
});
