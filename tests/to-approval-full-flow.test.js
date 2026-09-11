import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const approval = fs.readFileSync(new URL('../services/toPeriodApprovalService.js', import.meta.url), 'utf8');
const smtp = fs.readFileSync(new URL('../services/toPeriodEmailDeliveryService.js', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../routes/toPeriodSheetBridge.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../public/js/to-reports-panel.js', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../public/js/to-period-sheet-bridge.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('TO yangi yuborish raundi barcha faol imzolovchilarni qayta pending holatiga oladi', () => {
  assert.match(approval, /const targets = \[\.\.\.signers\]/);
  assert.match(approval, /resetExisting: true/);
  assert.match(approval, /approved: 0/);
  assert.match(smtp, /const targets = \[\.\.\.signers\]/);
  assert.match(smtp, /resetExisting: true/);
  assert.match(smtp, /approved: 0/);
  assert.doesNotMatch(approval, /status: 'already-approved'/);
  assert.doesNotMatch(smtp, /status: 'already-approved'/);
});

test('TO yangi raunddan oldin barcha email manzillari tekshiriladi', () => {
  assert.match(approval, /const invalidRecipients = targets\.filter/);
  assert.match(approval, /EMAIL_INVALID_RECIPIENT/);
  assert.match(smtp, /const invalidRecipients = targets\.filter/);
  assert.match(smtp, /EMAIL_INVALID_RECIPIENT/);
  const httpValidation = approval.indexOf('const invalidRecipients = targets.filter');
  const httpReset = approval.indexOf('resetExisting: true');
  const smtpValidation = smtp.indexOf('const invalidRecipients = targets.filter');
  const smtpReset = smtp.indexOf('resetExisting: true');
  assert.ok(httpValidation >= 0 && httpReset > httpValidation);
  assert.ok(smtpValidation >= 0 && smtpReset > smtpValidation);
});

test('TO eski approval link yangi yuborishdan keyin qat’iy bekor qilinadi', () => {
  assert.match(approval, /row\.id === payload\.approvalId/);
  assert.match(approval, /row\.signerId === payload\.signerId/);
  assert.match(approval, /clean\(row\.email\)\.toLowerCase\(\) === clean\(payload\.email\)\.toLowerCase\(\)/);
  assert.match(approval, /approval\.tokenHash !== sha256\(token\)/);
  assert.match(approval, /bekor qilingan yoki yangilangan/);
  assert.doesNotMatch(approval, /approval\.status !== 'Тасдиқланди'/);
});

test('TO public approval status har bir imzolovchi tokeniga alohida bog‘langan', () => {
  assert.match(route, /\/approve\/status\/:token/);
  assert.match(route, /getToPeriodApprovalStatus/);
  assert.match(approval, /function sameApproval/);
  assert.match(approval, /expectedApproval/);
  assert.match(approval, /\/api\/to-period-bridge\/approve\/status\//);
  assert.match(approval, /window\.addEventListener\('pageshow'/);
  assert.match(approval, /Ushbu havola:/);
});

test('TO A4 faqat tasdiqlangan imzolovchi uchun elektron imzo rasmini chiqaradi', () => {
  assert.match(approval, /createSignatureImageToken/);
  assert.match(approval, /extractSignatureFileId/);
  assert.match(approval, /\/api\/signature\/render\//);
  assert.match(approval, /const approved = clean\(row\.status\) === 'Тасдиқланди'/);
  assert.match(approval, /approved && fileId/);
  assert.match(approval, /to-a4-signature-image/);
});

test('TO HTTP va SMTP email yuborish provider message ID va audit izini saqlaydi', () => {
  assert.match(approval, /providerMessageId/);
  assert.match(approval, /action: 'DOCUMENT_SENT'/);
  assert.match(approval, /action: 'EMAIL_FAILED'/);
  assert.match(approval, /messageId=/);
  assert.match(smtp, /providerMessageId/);
  assert.match(smtp, /action: 'DOCUMENT_SENT'/);
  assert.match(smtp, /action: 'EMAIL_FAILED'/);
  assert.match(smtp, /messageId=/);
});

test('TO approval open va approve hodisalari auditga yoziladi', () => {
  assert.match(approval, /action: 'DOCUMENT_OPENED'/);
  assert.match(approval, /action: 'DOCUMENT_APPROVED'/);
  assert.match(approval, /details: 'module=TO'/);
});

test('TO frontend provider qabul qilgan xabarni aniq ko‘rsatadi va cache yangilanadi', () => {
  assert.match(ui, /function showDeliveryTrace/);
  assert.match(ui, /providerMessageId/);
  assert.match(ui, /email provider tomonidan qabul qilindi/);
  assert.match(ui, /Gmail inboxga yetib borishi provider va spam filtrlarga bog‘liq/);
  assert.match(bridge, /to-reports2-full-signing/);
  assert.match(server, /to-period-bridge2-full-signing/);
});
