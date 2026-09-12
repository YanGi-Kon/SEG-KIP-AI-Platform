import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const bridgeSource = fs.readFileSync(new URL('../public/js/hisobot-period-bridge.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const hisobotHtmlSource = fs.readFileSync(new URL('../public/modules/hisobot-journal.html', import.meta.url), 'utf8');
const kudukHtmlSource = fs.readFileSync(new URL('../public/modules/kuduk-journal.html', import.meta.url), 'utf8');
const routeSource = fs.readFileSync(new URL('../routes/hisobotPeriod.js', import.meta.url), 'utf8');
const kudukRouteSource = fs.readFileSync(new URL('../routes/kuduk.js', import.meta.url), 'utf8');
const {
  loadHisobotPeriodData,
  parseHisobotPeriodRows,
  shouldWriteHisobotSelector,
} = await import('../routes/hisobotPeriod.js');

test('HISOBOT JURNALI removes legacy route dropdown and injects TO-style period bridge', () => {
  assert.match(serverSource, /app\.get\("\/modules\/kuduk-journal\.html"/);
  assert.match(serverSource, /html\.replace\(\/<select id="routeSelect"/);
  assert.match(serverSource, /hisobot-period-bridge\.js\?v=hisobot-period7-hide-source/);
  assert.match(bridgeSource, /oldSelector\.remove\(\)/);
  assert.match(bridgeSource, /hisobotPrevPeriodBtn/);
  assert.match(bridgeSource, /hisobotPeriodMonth/);
  assert.match(bridgeSource, /hisobotPeriodYear/);
  assert.match(bridgeSource, /hisobotNextPeriodBtn/);
});

test('HISOBOT cards do not expose internal Google Sheets source labels to users', () => {
  for (const source of [bridgeSource, hisobotHtmlSource, kudukHtmlSource]) {
    assert.doesNotMatch(source, /Умумий журнал: База/);
    assert.doesNotMatch(source, /Варақ:\s*<b>/);
  }
  assert.match(appSource, /modules\/hisobot-journal\.html\?v=20260912-hide-source1/);
});

test('HISOBOT month and year changes automatically synchronize the selected Sheets period', () => {
  assert.match(bridgeSource, /API_PATH = '\/api\/hisobot-period\/select'/);
  assert.match(bridgeSource, /addEventListener\('change', \(\) => void selectFromControls\(\)\)/);
  assert.match(bridgeSource, /navigatePeriod\(-1\)/);
  assert.match(bridgeSource, /navigatePeriod\(1\)/);
  assert.match(bridgeSource, /body: JSON\.stringify\(requestBody\)/);
  assert.match(serverSource, /app\.use\("\/api\/hisobot-period", hisobotPeriodRouter\)/);
});

test('HISOBOT backend verifies Base selector layout and writes O1/Q1 like the period mechanism', () => {
  assert.match(routeSource, /!N1:Q1/);
  assert.match(routeSource, /toUpperCase\(\) !== 'ГОД'/);
  assert.match(routeSource, /toUpperCase\(\) !== 'МЕСЯЦ'/);
  assert.match(routeSource, /!O1/);
  assert.match(routeSource, /!Q1/);
  assert.match(routeSource, /valueInputOption: 'RAW'/);
});

test('HISOBOT period source prefers Base __Год and __Месяц when visible date is blank', () => {
  const rows = [
    [''],
    [''],
    [''],
    ['Дата','Поз номер','Наименование СИ','Тип, марка','Заводской номер','Предел измерения','Место установки','СКВ','Перечень в/р','Исполнитель работ: Должность Ф.И.О.','Подпись','__Год','__Месяц'],
    ['', '1', 'Манометр', 'WIKA', 'CE5H', '1 МПа', '1-участка', 'скв. 21', 'ТО-2', '', '', '2026', 'Июль'],
    ['', '2', 'Манометр', 'WIKA', 'C8HO', '1.6 МПа', '1-участка', 'скв. 848', 'АКТ', '', '', '2026', 'Июль'],
    ['08.2026г', '3', 'Манометр', 'WIKA', 'C8FV8', '1.6 МПа', '1-участка', 'скв. 21', 'ТО-2', '', '', '2026', 'Август'],
  ];

  const july = parseHisobotPeriodRows(rows, 2026, 7);
  assert.equal(july.periodSource, 'helpers');
  assert.equal(july.rows.length, 2);
  assert.equal(july.rows[0]._periodBaseRowNumber, 5);
  assert.equal(july.rows[0].serial, 'CE5H');
  assert.equal(july.rows[1].work, 'АКТ');

  const august = parseHisobotPeriodRows(rows, 2026, 'Август');
  assert.equal(august.rows.length, 1);
  assert.equal(august.rows[0].date, '08.2026г');
});

test('HISOBOT bridge keeps period rows editable through their real Base row number', () => {
  assert.match(bridgeSource, /_periodBaseRowNumber/);
  assert.match(bridgeSource, /currentSheet = periodBaseSheet/);
  assert.match(bridgeSource, /rawFetchState/);
});


test('HISOBOT selected month/year persists per Workspace and is restored after leaving the menu', () => {
  assert.match(bridgeSource, /PERIOD_STORAGE_PREFIX = 'seg_hisobot_period_v1'/);
  assert.match(bridgeSource, /function periodStorageKey/);
  assert.match(bridgeSource, /function writeSavedPeriod/);
  assert.match(bridgeSource, /function restoreSavedPeriod/);
  assert.match(bridgeSource, /writeSavedPeriod\(periodYear, periodMonth\)/);
  assert.match(bridgeSource, /const restored = restoreSavedPeriod\(\)/);
  assert.match(bridgeSource, /requestPeriod\(\{ fromSheet: !restored \}\)/);
});

test('HISOBOT restores the last successful period without syncing again after menu navigation', () => {
  assert.match(bridgeSource, /PERIOD_CACHE_PROPERTY = '__segKipHisobotPeriodCacheV1'/);
  assert.match(bridgeSource, /PERIOD_CACHE_DB = 'seg-kip-hisobot-period-cache-v1'/);
  assert.match(bridgeSource, /function rememberPeriodData/);
  assert.match(bridgeSource, /function restoreCachedPeriod/);
  assert.match(bridgeSource, /cached\.stateSignature !== stateSignature\(\)/);
  assert.match(bridgeSource, /restored && await restoreCachedPeriod\(\)/);
  assert.match(bridgeSource, /writePersistentPeriod\(entry\)/);
  assert.doesNotMatch(bridgeSource, /\}, 700\);/);
});

test('HISOBOT iframe remains alive while another top-level menu is used', () => {
  assert.match(indexSource, /id="hisobotModuleFrame"/);
  assert.match(appSource, /const isJournal = moduleName === 'journal'/);
  assert.match(appSource, /frame\.getAttribute\('src'\) !== src/);
  assert.match(appSource, /journalFrame\.hidden = !isJournal/);
});

test('HISOBOT retries the same Workspace after the parent session finishes restoring', () => {
  assert.match(hisobotHtmlSource, /let workspaceReloading = false/);
  assert.match(hisobotHtmlSource, /let workspaceReloadPending = false/);
  assert.match(hisobotHtmlSource, /!workspaceChanged && workspaceReloading/);
  assert.match(hisobotHtmlSource, /workspaceReloadPending = true/);
  assert.match(hisobotHtmlSource, /function finishWorkspaceReload/);
  assert.match(hisobotHtmlSource, /Workspace sessiyasi tiklanmoqda/);
  assert.match(hisobotHtmlSource, /finally\(\(\) => finishWorkspaceReload\(activeWorkspaceId\)\)/);
  assert.match(bridgeSource, /!state\?\.connected[\s\S]*?Workspace sessiyasi kutilmoqda/);
});

test('HISOBOT server does not cache explicit period responses ahead of the Sheets selector', () => {
  assert.doesNotMatch(routeSource, /periodResponseCache/);
  assert.doesNotMatch(routeSource, /createHisobotPeriodResponseCache/);
  assert.doesNotMatch(routeSource, /cacheHit/);
});

test('HISOBOT period request times out instead of leaving the syncing status indefinitely', () => {
  assert.match(bridgeSource, /REQUEST_TIMEOUT_MS = 20_000/);
  assert.match(bridgeSource, /new AbortController\(\)/);
  assert.match(bridgeSource, /signal: controller\.signal/);
  assert.match(bridgeSource, /error\?\.name === 'AbortError'/);
});

test('HISOBOT backend reuses one Sheets client and skips unchanged selector writes', () => {
  assert.equal([...routeSource.matchAll(/await getSheetsClient\(/g)].length, 1);
  assert.match(routeSource, /async function readSelector/);
  assert.match(routeSource, /async function readPeriodRows/);
  assert.doesNotMatch(routeSource, /await listSheets\(/);
  assert.doesNotMatch(routeSource, /await readSheetRows\(/);
  assert.equal(shouldWriteHisobotSelector({ year: 2026, month: 'Август' }, { year: 2026, month: 8 }, true), false);
  assert.equal(shouldWriteHisobotSelector({ year: 2026, month: 'Июль' }, { year: 2026, month: 8 }, true), true);
  assert.equal(shouldWriteHisobotSelector({ year: 2026, month: 'Июль' }, { year: 2026, month: 8 }, false), false);
});

test('HISOBOT writes a changed selector before reading calculated period rows', async () => {
  const calls = [];
  const sheets = {
    spreadsheets: {
      values: {
        get: async ({ range }) => {
          if (range.endsWith('!N1:Q1')) {
            calls.push('read-selector');
            return { data: { values: [['ГОД', '2026', 'МЕСЯЦ', 'Июль']] } };
          }
          calls.push('read-rows');
          return { data: { values: [] } };
        },
        batchUpdate: async () => {
          calls.push('write-selector');
          return { data: {} };
        },
      },
    },
  };

  const result = await loadHisobotPeriodData({
    sheets,
    spreadsheetId: 'spreadsheet-id',
    baseSheet: 'База',
    requestedYear: 2026,
    requestedMonth: 8,
    explicitlyRequested: true,
  });

  assert.deepEqual(calls, ['read-selector', 'write-selector', 'read-rows']);
  assert.deepEqual(result.selection, { year: 2026, month: 8, monthName: 'Август' });
});

test('HISOBOT reselects August after September by writing the real Sheets selector again', async () => {
  const calls = [];
  let selectorMonth = 'Июль';
  const sheets = {
    spreadsheets: {
      values: {
        get: async ({ range }) => {
          if (range.endsWith('!N1:Q1')) {
            calls.push(`read-selector:${selectorMonth}`);
            return { data: { values: [['ГОД', '2026', 'МЕСЯЦ', selectorMonth]] } };
          }
          calls.push('read-rows');
          return { data: { values: [] } };
        },
        batchUpdate: async ({ requestBody }) => {
          selectorMonth = requestBody.data.find((item) => item.range.endsWith('!Q1'))?.values?.[0]?.[0] || selectorMonth;
          calls.push(`write-selector:${selectorMonth}`);
          return { data: {} };
        },
      },
    },
  };

  await loadHisobotPeriodData({
    sheets,
    spreadsheetId: 'spreadsheet-id',
    baseSheet: 'База',
    requestedYear: 2026,
    requestedMonth: 8,
    explicitlyRequested: true,
  });
  await loadHisobotPeriodData({
    sheets,
    spreadsheetId: 'spreadsheet-id',
    baseSheet: 'База',
    requestedYear: 2026,
    requestedMonth: 9,
    explicitlyRequested: true,
  });
  await loadHisobotPeriodData({
    sheets,
    spreadsheetId: 'spreadsheet-id',
    baseSheet: 'База',
    requestedYear: 2026,
    requestedMonth: 8,
    explicitlyRequested: true,
  });

  assert.deepEqual(
    calls.filter((call) => call.startsWith('write-selector:')),
    ['write-selector:Август', 'write-selector:Сентябрь', 'write-selector:Август'],
  );
});

test('HISOBOT menu reuses the server metadata cache instead of rereading validation grids on every return', () => {
  assert.match(kudukRouteSource, /router\.get\("\/metadata"[\s\S]*?getTenantMetadata\(t\)/);
});
