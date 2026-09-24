import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const faults = fs.readFileSync(new URL('../public/modules/faults.html', import.meta.url), 'utf8');
const actsRoute = fs.readFileSync(new URL('../routes/acts.js', import.meta.url), 'utf8');
const blankService = fs.readFileSync(new URL('../services/actBlankSheetService.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');

test('faults selected month reloads ACT monthly analysis from server', () => {
  assert.match(faults, /function reloadSelectedPeriod\(\)/);
  assert.match(faults, /changePeriod\(\)[\s\S]*reloadSelectedPeriod\(\)/);
  assert.match(faults, /navigatePeriod\(delta\)[\s\S]*reloadSelectedPeriod\(\)/);
  assert.match(faults, /\/api\/acts\/monthly-analysis/);
  assert.match(faults, /year:state\.periodYear/);
  assert.match(faults, /month:state\.periodMonth/);
});

test('faults merges monthly source rows with completed ACT registry rows', () => {
  assert.match(faults, /function mergePeriodRows\(monthlyRows=\[\],dailyRows=\[\]\)/);
  assert.match(faults, /dailyBySourceKey/);
  assert.match(faults, /sourceKeyValue\(source\)/);
  assert.match(faults, /renderCurrentPeriodRows\(mergePeriodRows\(monthlyRows,dailyRows\)\)/);
  assert.match(faults, /report\?\.deviceName\|\|report\?\.device/);
  assert.match(faults, /report\?\.serialNo\|\|report\?\.serial/);
  assert.match(faults, /report\?\.measureRange/);
});

test('ACT registry endpoint exposes Google Sheets read errors instead of false empty list', () => {
  assert.match(blankService, /throwOnError = false/);
  assert.match(blankService, /if \(throwOnError\) throw error/);
  assert.match(actsRoute, /getDailyReports\(\{ \.\.\.config, throwOnError: true \}\)/);
});

test('faults distinguishes partial source failures from genuine zero rows', () => {
  assert.match(faults, /QISMAN BOG‘LANGAN/);
  assert.match(faults, /oylik ACT manbasi xatosi/);
  assert.match(faults, /reestr xatosi/);
  assert.match(faults, /ULANISH XATOSI/);
});

test('faults module cache is refreshed', () => {
  assert.match(app, /faults: 'modules\/faults\.html\?v=20260924-workflow1'/);
});
