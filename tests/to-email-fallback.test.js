import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../routes/toPeriodSheetBridge.js', import.meta.url), 'utf8');
const delivery = fs.readFileSync(new URL('../services/toPeriodEmailDeliveryService.js', import.meta.url), 'utf8');

test('TO report send route transport fallback service orqali ishlaydi', () => {
  assert.match(route, /sendToPeriodForApprovalWithFallback/);
  assert.match(route, /toPeriodEmailDeliveryService\.js/);
});

test('TO email delivery HTTP provider bo‘lmasa mavjud SMTP diagnostika stackiga tushadi', () => {
  assert.match(delivery, /hasHttpEmailProvider/);
  assert.match(delivery, /verifySafeEmailTransport/);
  assert.match(delivery, /sendSafeEmail/);
  assert.match(delivery, /GMAIL_USER\/GMAIL_APP_PASSWORD/);
  assert.match(delivery, /SMTP_USER\/SMTP_PASS/);
});

test('TO SMTP fallback ham original approval token formatini saqlaydi', () => {
  assert.match(delivery, /type: 'to-period-approval'/);
  assert.match(delivery, /audience: 'to-period-approval'/);
  assert.match(delivery, /ҲУЖЖАТ_ТАСДИҚЛАШ/);
  assert.match(delivery, /\/api\/to-period-bridge\/approve\//);
});
