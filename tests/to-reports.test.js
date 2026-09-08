import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridgeRoute = fs.readFileSync(new URL('../routes/toPeriodSheetBridge.js', import.meta.url), 'utf8');
const reportService = fs.readFileSync(new URL('../services/toPeriodApprovalService.js', import.meta.url), 'utf8');
const reportUi = fs.readFileSync(new URL('../public/js/to-reports-panel.js', import.meta.url), 'utf8');
const periodBridge = fs.readFileSync(new URL('../public/js/to-period-sheet-bridge.js', import.meta.url), 'utf8');

test('TO reports oy papkalari va A4 preview endpointlari bilan ulangan', () => {
  assert.match(bridgeRoute, /router\.get\('\/reports'/);
  assert.match(bridgeRoute, /router\.get\('\/reports\/:year\/:month'/);
  assert.match(reportService, /renderToPeriodA4/);
  assert.match(reportUi, /3\. Хисоботлар/);
  assert.match(reportUi, /📁/);
  assert.match(reportUi, /to-reports-a4-host/);
});

test('TO tayyor hujjat imzolovchilarga individual approval havola bilan yuboriladi', () => {
  assert.match(bridgeRoute, /router\.post\('\/reports\/:year\/:month\/send'/);
  assert.match(bridgeRoute, /requireToSend/);
  assert.match(reportService, /listWorkspaceSigners/);
  assert.match(reportService, /sendHttpEmail/);
  assert.match(reportService, /audience: 'to-period-approval'/);
  assert.match(reportService, /\/api\/to-period-bridge\/approve\//);
  assert.match(reportUi, /Хужатни юбориш/);
});

test('TO approval public link A4 hujjatni ochadi va tasdiqlashni yozadi', () => {
  assert.match(bridgeRoute, /router\.get\('\/approve\/:token'/);
  assert.match(bridgeRoute, /router\.post\('\/approve'/);
  assert.match(reportService, /openToPeriodApproval/);
  assert.match(reportService, /approveToPeriod/);
  assert.match(reportService, /Тасдиқланди/);
});

test('TO module reports va signers panellarini runtime yuklaydi', () => {
  assert.match(periodBridge, /to-signers-panel\.js/);
  assert.match(periodBridge, /to-reports-panel\.js/);
  assert.match(periodBridge, /toOpenPeriodBtn'\)\?\.remove/);
});
