import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/modules/to.html', import.meta.url), 'utf8');

test('TO JURNALI oylik davr boshqaruvlarini ko‘rsatadi', () => {
  for (const id of [
    'toPeriodMonth',
    'toPeriodYear',
    'toOpenPeriodBtn',
    'toCreatePeriodBtn',
    'toPrevPeriodBtn',
    'toNextPeriodBtn',
    'toPeriodStatus',
    'toSyncFromSheetBtn',
    'toSyncToSheetBtn',
    'toDocumentDateText',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /Создать период/);
  assert.match(html, /Предыдущий месяц/);
  assert.match(html, /Следующий месяц/);
  assert.match(html, /Август/);
});

test('TO JURNALI oylik API va Sheets sync bilan ulangan', () => {
  assert.match(html, /apiRequest\('\/api\/to\/periods'/);
  assert.match(html, /\/api\/to\/periods\/\$\{state\.periodYear\}\/\$\{state\.periodMonth\}/);
  assert.match(html, /sync-from-sheet/);
  assert.match(html, /sync-to-sheet/);
  assert.match(html, /method:'PATCH'/);
  assert.match(html, /data-period-field="technicalState"/);
  assert.match(html, /data-period-field="workType"/);
  assert.match(html, /data-period-field="note"/);
});

test('TO hujjat sanasi tanlangan oy va yilga dinamik bog‘langan', () => {
  assert.match(html, /function formatDocumentDate/);
  assert.match(html, /function previewSelectedPeriodDate/);
  assert.match(html, /toDocumentDateText/);
  assert.match(html, /DEFAULT_PERIOD_YEAR=2026/);
  assert.match(html, /DEFAULT_PERIOD_MONTH=6/);
});
