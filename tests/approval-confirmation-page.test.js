import test from 'node:test';
import assert from 'node:assert/strict';
import { renderApprovalPage } from '../services/signatureApprovalService.js';

function approvalPage(status) {
  return renderApprovalPage({
    approval: {
      id: 'APR_SIGNER_2',
      signerId: 'signer-2',
      gmail: 'signer2@gmail.com',
      status,
      position: 'ДНГ мастери',
      fio: 'Жалолов Р',
      approvedAt: status === 'Тасдиқланди' ? '2026-09-11T10:00:00.000Z' : '',
    },
    document: {
      actNo: 'АКТ_TEST_CONFIRMATION',
      a4Html: '<div class="a4-preview">TEST</div>',
    },
    csrfToken: 'csrf-test-token',
  }, 'approval-test-token');
}

test('opening a pending approval renders an explicit confirmation button', () => {
  const html = approvalPage('Кутилмоқда');
  assert.match(html, />Tasdiqlash<\/button>/);
  assert.doesNotMatch(html, /id="approveBtn"\s+disabled/);
  assert.match(html, /addEventListener\('click'/);
  assert.match(html, /fetch\('\/api\/document\/approve',\{method:'POST'/);
  assert.match(html, /csrfToken/);
});

test('an already approved document cannot be approved again from the page', () => {
  const html = approvalPage('Тасдиқланди');
  assert.match(html, /id="approveBtn" disabled>Tasdiqlangan<\/button>/);
});


test('approval page revalidates only its own signer token status before showing approved', () => {
  const html = approvalPage('Кутилмоқда');
  assert.match(html, /expectedApproval/);
  assert.match(html, /approvalId.*APR_SIGNER_2/);
  assert.match(html, /signerId.*signer-2/);
  assert.match(html, /signer2@gmail\.com/);
  assert.match(html, /\/api\/document\/approve\/status\//);
  assert.match(html, /function sameApproval/);
  assert.match(html, /window\.addEventListener\('pageshow'/);
  assert.match(html, /b\.textContent=approved\?'Tasdiqlangan':'Tasdiqlash'/);
  assert.doesNotMatch(html, /id="approveBtn"\s+disabled>Tasdiqlangan<\/button>/);
});

test('approval page labels the exact recipient so parallel Gmail approvals cannot be confused', () => {
  const html = approvalPage('Кутилмоқда');
  assert.match(html, /Ushbu havola:/);
  assert.match(html, /Жалолов Р/);
  assert.match(html, /signer2@gmail\.com/);
});
