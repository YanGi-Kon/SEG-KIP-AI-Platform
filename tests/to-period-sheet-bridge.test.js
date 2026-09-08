import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../public/js/to-period-sheet-bridge.js', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../routes/toPeriodSheetBridge.js', import.meta.url), 'utf8');

test('TO module period bridge script is served before static fallback', () => {
  assert.match(server, /app\.get\("\/modules\/to\.html"/);
  assert.match(server, /to-period-sheet-bridge\.js/);
  assert.match(server, /app\.use\("\/api\/to-period-bridge", toPeriodSheetBridgeRouter\)/);
});

test('project period selection writes Sheets B7:C7 as raw text and re-reads A:H', () => {
  assert.match(route, /range: `\$\{quoteSheetName\(sheetName\)\}!B7:C7`/);
  assert.match(route, /valueInputOption: 'RAW'/);
  assert.doesNotMatch(route, /valueInputOption: 'USER_ENTERED'/);
  assert.match(route, /values: \[\[monthName, String\(year\)\]\]/);
  assert.match(route, /range: 'A:H'/);
  assert.match(route, /parseToSheetRows\(rows\)/);
  assert.match(route, /'Январь'.*'Июнь'.*'Декабрь'/s);
});

test('TO period selectors automatically call bridge and open selected period', () => {
  assert.doesNotThrow(() => new Function(client));
  assert.match(client, /toPeriodMonth.*addEventListener\('change', scheduleSync\)/s);
  assert.match(client, /toPeriodYear.*addEventListener\('change', scheduleSync\)/s);
  assert.match(client, /\/api\/to-period-bridge\/select/);
  assert.match(client, /openSelectedPeriod\(\{ fallbackToSource: true \}\)/);
  assert.match(client, /state\.sections = Array\.isArray\(data\.sections\)/);
});

test('TO period bridge route module imports successfully', async () => {
  const mod = await import('../routes/toPeriodSheetBridge.js');
  assert.ok(mod.default);
});
