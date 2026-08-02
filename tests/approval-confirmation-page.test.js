import test from 'node:test';
import assert from 'node:assert/strict';
import { renderApprovalPage } from '../services/signatureApprovalService.js';

function approvalPage(status) {
  return renderApprovalPage({
    approval: {
      status,
      position: 'ДНГ мастери',
      fio: 'Жалолов Р',
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
