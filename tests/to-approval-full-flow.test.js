import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const approval = fs.readFileSync(new URL('../services/toPeriodApprovalService.js', import.meta.url), 'utf8');
const smtp = fs.readFileSync(new URL('../services/toPeriodEmailDeliveryService.js', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../routes/toPeriodSheetBridge.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../public/js/to-reports-panel.js', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../public/js/to-period-sheet-bridge.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const periodRepo = fs.readFileSync(new URL('../repositories/toPeriodRepository.js', import.meta.url), 'utf8');
const periodService = fs.readFileSync(new URL('../services/toPeriodService.js', import.meta.url), 'utf8');
const toRoute = fs.readFileSync(new URL('../routes/to.js', import.meta.url), 'utf8');
const toModule = fs.readFileSync(new URL('../public/modules/to.html', import.meta.url), 'utf8');

test('TO yuborish faqat imzosi yo‘q hujjat approverlariga ishlaydi', () => {
  assert.match(approval, /resolveToPeriodApprovalTargets/);
  assert.match(approval, /selectUnsignedToPeriodTargets/);
  assert.match(approval, /const allTargets = resolvedTargets\.targets/);
  assert.match(approval, /const targets = selectUnsignedToPeriodTargets\(allTargets, current\.rows\)/);
  assert.match(approval, /const alreadySigned = allTargets\.length - targets\.length/);
  assert.match(approval, /status: 'already-signed'/);
  assert.match(approval, /skippedSigned: alreadySigned/);
  assert.match(smtp, /selectUnsignedToPeriodTargets/);
  assert.match(smtp, /const allTargets = resolvedTargets\.targets/);
  assert.match(smtp, /const targets = selectUnsignedToPeriodTargets\(allTargets, approvalState\.rows\)/);
  assert.match(smtp, /status: 'already-signed'/);
  assert.doesNotMatch(approval, /const targets = \[\.\.\.signers\]/);
  assert.doesNotMatch(smtp, /const targets = \[\.\.\.signers\]/);
});
test('TO tanlangan approverlar hujjat metadata siga saqlanadi va report shu ro‘yxatni ko‘rsatadi', () => {
  assert.match(periodRepo, /updateToPeriodApprovalAssignments/);
  assert.match(periodRepo, /'approvalPolicy', 'all-assigned-v2'/);
  assert.match(periodRepo, /'assignedApprovers', \$3::jsonb/);
  assert.match(periodService, /normalizeToAssignedApprovers/);
  assert.match(periodService, /assignedApprovers: normalizeToAssignedApprovers\(input\.assignedApprovers\)/);
  assert.match(toRoute, /updateToPeriodApprovalAssignments/);
  assert.match(toModule, /getSelectedApprovers:selectedApproverAssignments/);
  assert.match(bridge, /const payload = assignedApprovers\.length \? \{ assignedApprovers \} : \{\}/);
  assert.match(approval, /completeToPeriodApproverAssignments/);
  assert.match(approval, /registeredSigners = await listWorkspaceSigners/);
  assert.match(approval, /assignedApproversForBundle\(bundle\)/);
  assert.match(ui, /approvalRowsHtml\(report\.approvals \|\| \[\], report\.assignedApprovers \|\| \[\], report\.signerStates \|\| \[\]\)/);
});

test('TO yetishmayotgan signer slotlarini F.I.O. bo‘yicha aktiv registrdan to‘ldiradi', () => {
  assert.match(approval, /TO_SIGNER_SLOT_DEFINITIONS/);
  assert.match(approval, /preferredName: 'Мазординов Э\.'/);
  assert.match(approval, /preferredName: 'Хошимов Б\.'/);
  assert.match(approval, /preferredName: 'Куйликов Р\. А\.'/);
  assert.match(approval, /normalizeSignerLookupText/);
  assert.match(approval, /signerRoleKey/);
  assert.match(approval, /missingSignerSlots/);
  assert.match(toModule, /Avval hujjat shablonidagi F\.I\.O\. bilan aniq mos signer olinadi\./);
});

test('TO yangi raunddan oldin tanlangan imzolovchilarning email manzillari tekshiriladi', () => {
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
  assert.match(approval, /approvalBelongsToAssignments/);
  assert.match(approval, /tasdiqlovchi hujjatdan olib tashlangan/);
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

test('TO report A4 aynan yaratilgan hujjat tuzilmasini saqlaydi va avtomatik imzolarni ko‘rsatadi', () => {
  assert.match(approval, /buildToPeriodSignerStates/);
  assert.match(approval, /automaticSignature/);
  assert.match(approval, /row\.signed && fileId/);
  assert.match(approval, /\/api\/signature\/render\//);
  assert.match(approval, /TO_SIGNER_ROLE_LABELS/);
  assert.match(approval, /to-a4-header-text/);
  assert.match(approval, /to-a4-title-text/);
  assert.match(approval, /to-a4-signature-list/);
  assert.match(approval, /to-a4-journal-table/);
  assert.match(approval, /to-a4-signers-block/);
  assert.match(approval, /to-a4-signer-row/);
  assert.match(approval, /@page\{size:A4 portrait/);
  assert.doesNotMatch(approval, /to-a4-workspace/);
  assert.match(approval, /unsignedApprovers: signerStates\.filter\(\(row\) => !row\.signed\)\.length/);
  assert.match(toModule, /Приложение № 2 к Регламенту проведения технического обслуживания/);
  assert.match(toModule, /class="signature-list"/);
  assert.match(toModule, /class="journal-table"/);
  assert.match(toModule, /class="signers-block"/);
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
  assert.match(ui, /email provider qabul qildi/);
  assert.match(ui, /Gmail inboxga yetib borishi provider va spam filtrlarga bog‘liq/);
  assert.match(ui, /TO_APPROVERS_NOT_ASSIGNED/);
  assert.match(ui, /faqat avtomatik\/tasdiqlangan imzosi yo‘q/);
  assert.match(ui, /JSON\.stringify\(\{ assignedApprovers \}\)/);
  assert.match(ui, /unsignedApprovers/);
  assert.match(bridge, /to-reports6-folder-actions/);
  assert.match(server, /to-period-bridge10-folder-actions/);
});
