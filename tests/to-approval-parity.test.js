import test from 'node:test';
import assert from 'node:assert/strict';

process.env.APPROVAL_JWT_SECRET ||= 'to-approval-parity-test-secret-1234567890';

const {
  renderToPeriodA4,
  summarizeToApprovals,
} = await import('../services/toPeriodApprovalService.js');

const bundle = {
  period: {
    id: 'period-1',
    year: 2026,
    month: 9,
    documentDate: '2026-09-25',
    conclusion: 'Заключение: оборудование исправно',
  },
  items: [{
    sourceRowNumber: 8,
    sectionName: 'ASOSIY',
    serialNo: 'SN-1',
    equipmentName: 'Манометр',
    positionNo: 'P-1',
    quantity: '1',
    technicalState: 'Исправно',
    workType: 'ТО-1',
    note: '',
  }],
};

const approvals = [
  {
    id: 'approval-1',
    signerId: 'signer-1',
    position: 'НУВваА устаси',
    fio: 'Tasdiqlovchi Bir',
    email: 'one@example.com',
    status: 'Тасдиқланди',
    signatureFileId: 'db:11111111-1111-4111-8111-111111111111',
    approvedAt: '2026-09-11T10:00:00.000Z',
  },
  {
    id: 'approval-2',
    signerId: 'signer-2',
    position: 'НУВваА Чилангари',
    fio: 'Tasdiqlovchi Ikki',
    email: 'two@example.com',
    status: 'Кутилмоқда',
    signatureFileId: 'db:22222222-2222-4222-8222-222222222222',
  },
];

test('TO approval summary partial, full va unsent holatlarni to‘g‘ri hisoblaydi', () => {
  assert.deepEqual(summarizeToApprovals([]), {
    total: 0,
    approved: 0,
    pending: 0,
    status: 'Юборилмаган',
  });
  assert.deepEqual(summarizeToApprovals(approvals), {
    total: 2,
    approved: 1,
    pending: 1,
    status: 'Қисман тасдиқланди',
  });
  assert.equal(
    summarizeToApprovals(approvals.map((row) => ({ ...row, status: 'Тасдиқланди' }))).status,
    'Тасдиқланди',
  );
});

test('TO A4 faqat tasdiqlangan imzolovchining PNG imzosini ko‘rsatadi', () => {
  const html = renderToPeriodA4(bundle, {
    workspaceName: 'Andijon test',
    approvals,
    baseUrl: 'https://example.test',
  });

  assert.match(html, /Tasdiqlovchi Bir/);
  assert.match(html, /Tasdiqlovchi Ikki/);
  assert.match(html, /https:\/\/example\.test\/api\/signature\/render\//);
  assert.match(html, /Кутилмоқда/);
  assert.equal((html.match(/<img /g) || []).length, 1);
});

test('bekor qilingan eski TO approval A4 va summarydan chiqarib tashlanadi', () => {
  const rows = approvals.concat([{
    id: 'old',
    signerId: 'old-signer',
    fio: 'Eski imzolovchi',
    status: 'Бекор қилинди',
    signatureFileId: 'db:33333333-3333-4333-8333-333333333333',
  }]);
  const summary = summarizeToApprovals(rows);
  const html = renderToPeriodA4(bundle, { approvals: rows, baseUrl: 'https://example.test' });

  assert.equal(summary.total, 2);
  assert.doesNotMatch(html, /Eski imzolovchi/);
});
