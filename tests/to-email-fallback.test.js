import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../routes/toPeriodSheetBridge.js', import.meta.url), 'utf8');
const delivery = fs.readFileSync(new URL('../services/toPeriodEmailDeliveryService.js', import.meta.url), 'utf8');
const approval = fs.readFileSync(new URL('../services/toPeriodApprovalService.js', import.meta.url), 'utf8');
const reportUi = fs.readFileSync(new URL('../public/js/to-reports-panel.js', import.meta.url), 'utf8');

test('TO report send route transport wrapper orqali yagona approval servicega tushadi', () => {
  assert.match(route, /sendToPeriodForApprovalWithFallback/);
  assert.match(route, /toPeriodEmailDeliveryService\.js/);
  assert.match(delivery, /sendToPeriodForApproval/);
  assert.doesNotMatch(delivery, /nodemailer|sendSafeEmail|sendHttpEmail/);
});

test('TO yagona approval service HTTP bo‘lmasa SMTP preflight va fallback ishlatadi', () => {
  assert.match(approval, /hasHttpEmailProvider/);
  assert.match(approval, /verifySafeEmailTransport/);
  assert.match(approval, /sendSafeEmail/);
  assert.match(approval, /sendHttpEmail/);
  assert.match(approval, /deliveryMode/);
});

test('TO yuborish oldin barcha recipientlarni tekshiradi va Resend test senderni bloklaydi', () => {
  assert.match(approval, /invalidRecipients/);
  assert.match(approval, /EMAIL_INVALID_RECIPIENT/);
  assert.match(approval, /EMAIL_FROM_MISSING/);
  assert.match(approval, /EMAIL_PROVIDER_RECIPIENT_NOT_ALLOWED/);
  assert.match(approval, /resend-test-sender/);
});

test('TO hisobot yuborish UI AKTLAR JURNALI kabi timeout, diagnostika va provider trace ko‘rsatadi', () => {
  assert.match(reportUi, /SEND_TIMEOUT_MS\s*=\s*120000/);
  assert.match(reportUi, /toReportsSendDiagnostic/);
  assert.match(reportUi, /recommendedFix/);
  assert.match(reportUi, /showDeliveryTrace/);
  assert.match(reportUi, /providerMessageId/);
  assert.match(reportUi, /email provider tomonidan qabul qilindi/);
});
