import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isAnalysisDateInPeriod, isAnalysisRowInPeriod, parseAnalysisDate } from '../routes/acts.js';

const actsHtml = fs.readFileSync(new URL('../public/modules/acts.html', import.meta.url), 'utf8');
const actsUi = fs.readFileSync(new URL('../public/js/acts.js', import.meta.url), 'utf8');
const actsRoute = fs.readFileSync(new URL('../routes/acts.js', import.meta.url), 'utf8');

test('Acts monthly analysis exposes TO-style month and year controls', () => {
  for (const id of ['actsPrevPeriodBtn', 'actsPeriodMonth', 'actsPeriodYear', 'actsPeriodStatus', 'actsNextPeriodBtn']) {
    assert.match(actsHtml, new RegExp(`id="${id}"`));
  }
  assert.match(actsUi, /ANALYSIS_MONTHS/);
  assert.match(actsUi, /navigateAnalysisPeriod\(-1\)/);
  assert.match(actsUi, /navigateAnalysisPeriod\(1\)/);
});

test('Acts selector sends year and month and refreshes automatically', () => {
  assert.match(actsUi, /analysisSettings\(\)/);
  assert.match(actsUi, /year:state\.analysisYear,month:state\.analysisMonth/);
  assert.match(actsUi, /actsPeriodMonth.*addEventListener\('change'/);
  assert.match(actsUi, /actsPeriodYear.*addEventListener\('change'/);
  assert.match(actsUi, /postJson\('\/api\/acts\/monthly-analysis',analysisSettings\(\)/);
});

test('Acts backend recognizes common formatted Sheet dates', () => {
  assert.deepEqual(parseAnalysisDate('14.07.2026'), { year: 2026, month: 7, day: 14 });
  assert.deepEqual(parseAnalysisDate('2026-09-10'), { year: 2026, month: 9, day: 10 });
  assert.deepEqual(parseAnalysisDate('3 сентября 2026'), { year: 2026, month: 9, day: 3 });
  assert.equal(parseAnalysisDate('2'), null);
  assert.equal(parseAnalysisDate('31.02.2026'), null);
  assert.equal(isAnalysisDateInPeriod('10.09.2026', 2026, 9), true);
  assert.equal(isAnalysisDateInPeriod('10.08.2026', 2026, 9), false);
});

test('Acts backend prefers Base helper year/month columns when the visible date is blank', () => {
  const helperColumns = { '__год': 11, '__месяц': 12 };
  const julyAkt = ['', '2', 'Манометр', 'WIKA', 'CE5H', '1 МПа', '1-участка', 'скв. 21', 'АКТ', '', '', '2026', 'Июль'];
  assert.equal(isAnalysisRowInPeriod(julyAkt, helperColumns, 2026, 7), true);
  assert.equal(isAnalysisRowInPeriod(julyAkt, helperColumns, 2026, 6), false);
  assert.equal(isAnalysisRowInPeriod(julyAkt, helperColumns, 2025, 7), false);
});

test('Acts backend reads helper columns and syncs the platform period to Base selector cells', () => {
  assert.match(actsRoute, /range: 'A:M'/);
  assert.match(actsRoute, /range: 'N1:Q1'/);
  assert.match(actsRoute, /range: `\$\{sheetRef\}!O1`/);
  assert.match(actsRoute, /range: `\$\{sheetRef\}!Q1`/);
  assert.match(actsRoute, /spreadsheets\.values\.batchUpdate/);
  assert.match(actsRoute, /valueInputOption: 'RAW'/);
});

test('Acts backend filters rows by selected period before the exact AKT marker', () => {
  assert.match(actsRoute, /const periodRows = dataRows\.filter\(x => isAnalysisRowInPeriod\(x\.row, colMap, year, month\)\)/);
  assert.match(actsRoute, /const matched = periodRows\s*\.filter\(x => isTargetWork\(x\.row\[wrkIdx\]\)\)/);
  assert.match(actsRoute, /totalRows: periodRows\.length/);
});
