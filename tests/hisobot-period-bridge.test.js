import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const bridgeSource = fs.readFileSync(new URL('../public/js/hisobot-period-bridge.js', import.meta.url), 'utf8');
const routeSource = fs.readFileSync(new URL('../routes/hisobotPeriod.js', import.meta.url), 'utf8');
const { parseHisobotPeriodRows, HISOBOT_PERIOD_MIN_YEAR, HISOBOT_PERIOD_MAX_YEAR } = await import('../routes/hisobotPeriod.js');

test('HISOBOT JURNALI removes legacy route dropdown and injects TO-style period bridge', () => {
  assert.match(serverSource, /app\.get\("\/modules\/kuduk-journal\.html"/);
  assert.match(serverSource, /html\.replace\(\/<select id="routeSelect"/);
  assert.match(serverSource, /hisobot-period-bridge\.js\?v=hisobot-period1/);
  assert.match(bridgeSource, /oldSelector\.remove\(\)/);
  assert.match(bridgeSource, /hisobotPrevPeriodBtn/);
  assert.match(bridgeSource, /hisobotPeriodMonth/);
  assert.match(bridgeSource, /hisobotPeriodYear/);
  assert.match(bridgeSource, /hisobotNextPeriodBtn/);
});

test('HISOBOT month and year changes automatically synchronize the selected Sheets period', () => {
  assert.match(bridgeSource, /API_PATH = '\/api\/hisobot-period\/select'/);
  assert.match(bridgeSource, /addEventListener\('change', \(\) => void selectFromControls\(\)\)/);
  assert.match(bridgeSource, /navigatePeriod\(-1\)/);
  assert.match(bridgeSource, /navigatePeriod\(1\)/);
  assert.match(bridgeSource, /JSON\.stringify\(fromSheet \? \{\} : \{ year: periodYear, month: periodMonth \}\)/);
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


test('HISOBOT year selector is intentionally limited to 2026-2028', () => {
  assert.equal(HISOBOT_PERIOD_MIN_YEAR, 2026);
  assert.equal(HISOBOT_PERIOD_MAX_YEAR, 2028);
  assert.match(bridgeSource, /const PERIOD_MIN_YEAR = 2026/);
  assert.match(bridgeSource, /const PERIOD_MAX_YEAR = 2028/);
  assert.match(bridgeSource, /const PERIOD_YEARS = \[2026, 2027, 2028\]/);
  assert.doesNotMatch(bridgeSource, /Math\.min\(2026, now\.getFullYear\(\)\)/);
  assert.doesNotMatch(bridgeSource, /Math\.max\(2026, now\.getFullYear\(\)\)/);
});

test('HISOBOT backend rejects years outside 2026-2028', () => {
  const rows = [
    ['Дата','Поз номер','Наименование СИ','Тип, марка','Заводской номер','Предел измерения','Место установки','СКВ','Перечень в/р','Исполнитель работ: Должность Ф.И.О.','Подпись','__Год','__Месяц'],
  ];
  assert.throws(() => parseHisobotPeriodRows(rows, 2025, 1), (error) => error?.code === 'HISOBOT_PERIOD_YEAR_INVALID');
  assert.throws(() => parseHisobotPeriodRows(rows, 2029, 1), (error) => error?.code === 'HISOBOT_PERIOD_YEAR_INVALID');
});
