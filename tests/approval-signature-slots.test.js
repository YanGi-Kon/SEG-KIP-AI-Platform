import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApprovalSlotMetadata,
  ensureSignatureSlotMarkers,
  injectApprovalSignaturesIntoSlots,
  selectAssignedSignersForApproval,
  summarizeRequiredApprovals,
} from '../services/signatureApprovalService.js';
import { selectEmailApprovalTargets } from '../services/workspaceApprovalBridgeService.js';

const metadata = {
  assignedApprovers: [
    { slot: 1, signerId: 'kip-1', fio: 'Fozilov O', position: 'КИП Мастер', gmail: 'kip@example.com', signatureFileId: 'db:11111111-1111-4111-8111-111111111111' },
    { slot: 2, signerId: 'signer-2', fio: 'Imzolovchi Ikki', position: 'Sex boshlig‘i', gmail: 'two@example.com', signatureFileId: 'db:22222222-2222-4222-8222-222222222222' },
    { slot: 3, signerId: 'signer-3', fio: 'Imzolovchi Uch', position: 'Muhandis', gmail: 'three@example.com', signatureFileId: 'db:33333333-3333-4333-8333-333333333333' },
  ],
};

const approvals = [
  { signerId: 'kip-1', fio: 'Fozilov O', position: 'КИП Мастер', gmail: 'kip@example.com', status: 'Кутилмоқда', signatureFileId: 'db:11111111-1111-4111-8111-111111111111' },
  { signerId: 'signer-2', fio: 'Imzolovchi Ikki', position: 'Sex boshlig‘i', gmail: 'two@example.com', status: 'Тасдиқланди', approvedAt: '2026-09-01T10:00:00.000Z', signatureFileId: 'db:22222222-2222-4222-8222-222222222222' },
  { signerId: 'signer-3', fio: 'Imzolovchi Uch', position: 'Muhandis', gmail: 'three@example.com', status: 'Кутилмоқда', signatureFileId: 'db:33333333-3333-4333-8333-333333333333' },
];

function slotCell(slot) {
  return `<div class="act-signers-cell" data-signature-slot="${slot}"><div class="act-signers-value"><span class="act-signer-text"></span><!--SEG_SIGNATURE_SLOT_${slot}_START--><!--SEG_SIGNATURE_SLOT_${slot}_END--></div></div>`;
}

test('approval metadata signer ID orqali aynan 1/2/3-slotga bog‘lanadi', () => {
  const rows = buildApprovalSlotMetadata(approvals, metadata);

  assert.deepEqual(rows.map((row) => row.slot), [1, 2, 3]);
  assert.equal(rows[1].status, 'Тасдиқланди');
  assert.equal(rows[1].approvedAt, '2026-09-01T10:00:00.000Z');
});

test('email tasdiqlash faqat 2–3-slot uchun talab qilinadi', () => {
  const workspaceSigners = metadata.assignedApprovers.map((row) => ({
    id: row.signerId,
    slot: row.slot,
    fullName: row.fio,
    position: row.position,
    email: row.gmail,
  }));
  const targets = selectEmailApprovalTargets(workspaceSigners);
  const summary = summarizeRequiredApprovals(approvals, metadata);

  assert.deepEqual(targets.map((row) => row.slot), [2, 3]);
  assert.equal(summary.total, 2);
  assert.equal(summary.approved, 1);
  assert.equal(summary.status, 'Қисман тасдиқланди');
});

test('SMTP fallback ham faqat hujjatga biriktirilgan 2–3-slot imzolovchilarini tanlaydi', () => {
  const registered = metadata.assignedApprovers.map((row) => ({
    id: row.signerId,
    fio: row.fio,
    position: row.position,
    gmail: row.gmail,
  })).concat([{ id: 'unrelated', fio: 'Begona imzolovchi', gmail: 'other@example.com' }]);
  const requested = metadata.assignedApprovers.filter((row) => row.slot > 1);
  const selected = selectAssignedSignersForApproval(registered, requested);

  assert.deepEqual(selected.map((row) => row.id), ['signer-2', 'signer-3']);
  assert.deepEqual(selected.map((row) => row.slot), [2, 3]);
});

test('KIP Master darhol, 2–3-slotlar esa faqat email tasdiqdan keyin ko‘rinadi', () => {
  const source = `<div class="a4-preview">${slotCell(1)}${slotCell(2)}${slotCell(3)}</div>`;
  const result = injectApprovalSignaturesIntoSlots(
    source,
    approvals,
    metadata,
    '',
    (fileId) => `/signature/${encodeURIComponent(fileId)}`,
  );

  assert.equal(result.markerCount, 3);
  assert.match(result.html, /data-approved-signature-slot="1"/);
  assert.match(result.html, /data-approved-signature-slot="2"/);
  assert.doesNotMatch(result.html, /data-approved-signature-slot="3"/);
  assert.match(result.html, /data-signature-slot="1"><div class="act-signers-value has-signature"/);
  assert.match(result.html, /data-signature-slot="2"><div class="act-signers-value has-signature"/);
  assert.match(result.html, /data-signature-slot="3"><div class="act-signers-value">/);
  assert.match(result.html, /\/signature\/db%3A11111111-1111-4111-8111-111111111111/);
  assert.match(result.html, /\/signature\/db%3A22222222-2222-4222-8222-222222222222/);
  assert.doesNotMatch(result.html, /33333333-3333-4333-8333-333333333333/);
});

test('eski A4 HTML ham uchinchi ustundagi uch imzo slotiga avtomatik migratsiya qilinadi', () => {
  const oldCell = (department, signature = '') => `<div class="act-signers-cell"><div class="act-signers-value${signature ? ' has-signature' : ''}"><span class="act-signer-text">${department}</span>${signature}</div><div class="act-signers-label">цех ва и/ж.</div></div>`;
  const oldSignature = '<span class="act-signature-box"><img src="blob:old-unsafe-signature" alt="Имзо"></span>';
  const oldHtml = `<div class="a4-preview">${oldCell('Цех №1', oldSignature)}${oldCell('Цех №2', oldSignature)}${oldCell('Цех №3', oldSignature)}</div>`;
  const migrated = ensureSignatureSlotMarkers(oldHtml);
  const result = injectApprovalSignaturesIntoSlots(migrated, approvals, metadata, '', (fileId) => `/signature/${encodeURIComponent(fileId)}`);

  assert.equal(result.markerCount, 3);
  assert.doesNotMatch(result.html, /blob:old-unsafe-signature/);
  assert.match(result.html, /data-approved-signature-slot="1"/);
  assert.match(result.html, /data-approved-signature-slot="2"/);
  assert.doesNotMatch(result.html, /data-approved-signature-slot="3"/);
});

test('final signatures mavjud bo‘lsa eski yuqori imzolar olib tashlanadi', () => {
  const upper = `${slotCell(1)}${slotCell(2)}${slotCell(3)}`;
  const lower = `${slotCell(1)}${slotCell(2)}${slotCell(3)}`;
  const source = `<div class="a4-preview">${upper}<!--SEG_FINAL_SIGNATURES_START-->${lower}<!--SEG_FINAL_SIGNATURES_END--></div>`;
  const result = injectApprovalSignaturesIntoSlots(source, approvals, metadata, '', (fileId) => `/signature/${encodeURIComponent(fileId)}`);
  const firstImage = result.html.indexOf('data-approved-signature-slot="1"');
  const finalStart = result.html.indexOf('<!--SEG_FINAL_SIGNATURES_START-->');

  assert.ok(firstImage > finalStart);
  assert.equal((result.html.match(/data-approved-signature-slot="1"/g) || []).length, 1);
  assert.equal((result.html.match(/data-approved-signature-slot="2"/g) || []).length, 1);
});
