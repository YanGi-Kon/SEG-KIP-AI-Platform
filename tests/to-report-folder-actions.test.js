import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync(new URL('../public/js/to-reports-panel.js', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../routes/toPeriodSheetBridge.js', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../services/toPeriodService.js', import.meta.url), 'utf8');
const repo = fs.readFileSync(new URL('../repositories/toPeriodRepository.js', import.meta.url), 'utf8');
const approval = fs.readFileSync(new URL('../services/toPeriodApprovalService.js', import.meta.url), 'utf8');

test('TO report papkalarida tahrirlash va o‘chirish piktogrammalari bor', () => {
  assert.match(ui, /data-report-edit=/);
  assert.match(ui, /data-report-delete=/);
  assert.match(ui, />✏️<\/button>/);
  assert.match(ui, />🗑️<\/button>/);
  assert.match(ui, /title="Таҳрирлаш"/);
  assert.match(ui, /title="Ўчириш"/);
  assert.match(ui, /event\.stopPropagation\(\)/);
});

test('TO report tahrirlash shu oy hujjatini asosiy oynada ochadi', () => {
  assert.match(ui, /async function editFolder\(year, month\)/);
  assert.match(ui, /workspace\.state\.periodYear = y/);
  assert.match(ui, /workspace\.state\.periodMonth = m/);
  assert.match(ui, /workspace\.openSelectedPeriod\(\{ fallbackToSource: false \}\)/);
  assert.match(ui, /applySignerSelectionsForCurrentPeriod/);
});

test('TO report o‘chirish tasdiqdan keyin draft hujjatni o‘chiradi', () => {
  assert.match(ui, /async function deleteFolder\(year, month\)/);
  assert.match(ui, /window\.confirm/);
  assert.match(ui, /method: 'DELETE'/);
  assert.match(route, /router\.delete\('\/reports\/:year\/:month'/);
  assert.match(route, /requireToCreate/);
  assert.match(service, /export async function deleteToPeriod/);
  assert.match(service, /Faqat draft holatdagi TO hujjatini o‘chirish mumkin/);
  assert.match(repo, /DELETE FROM to_periods/);
  assert.match(repo, /AND status = 'draft'/);
});

test('TO report o‘chirilganda eski approval qatorlari ham tozalanadi', () => {
  assert.match(route, /clearToPeriodApprovals/);
  assert.match(approval, /export async function clearToPeriodApprovals/);
  assert.match(approval, /spreadsheets\.values\.batchClear/);
  assert.match(approval, /APPROVALS_SHEET/);
});
