import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildToPeriodItems,
  deriveToDocumentDate,
} from '../services/toPeriodService.js';
import {
  findPeriodSheets,
  formatToPeriodDocumentDate,
  normalizeSheetTitle,
  planDuplicatePeriodSheetMerge,
  periodSheetTitle,
} from '../services/toPeriodSheetsService.js';

const migration = fs.readFileSync(new URL('../db/migrations/031_to_periods.sql', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../routes/to.js', import.meta.url), 'utf8');

test('TO period DB modeli workspace + yil + oy bo‘yicha yagona hujjat saqlaydi', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS to_periods/);
  assert.match(migration, /UNIQUE \(workspace_id, period_year, period_month\)/);
  assert.match(migration, /status IN \('draft', 'completed', 'archived'\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS to_period_items/);
  assert.match(migration, /monthly_sheet_name/);
  assert.match(migration, /sync_status/);
});

test('yangi TO davri source uskunalarni oladi, lekin oylik natija ustunlarini tozalaydi', () => {
  const items = buildToPeriodItems({
    sections: [{
      name: 'ЦДНГ №1',
      items: [{
        sourceRowNumber: 15,
        no: '1',
        serialNo: 'SN-1',
        equipmentName: 'Манометр',
        positionNo: 'PT-1',
        quantity: '1',
        technicalState: 'Июнь ҳолати',
        workType: 'ТО-1',
        note: 'Июнь изоҳи',
      }],
    }],
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].equipmentName, 'Манометр');
  assert.equal(items[0].technicalState, '');
  assert.equal(items[0].workType, '');
  assert.equal(items[0].note, '');
});

test('keyingi oy hujjat sanasi source hujjatdagi kundan davom etadi', () => {
  const rows = [
    ['Приложение'],
    ['«25» Июнь 2026г. ТПП «Андижан»'],
  ];
  assert.equal(deriveToDocumentDate(rows, 2026, 8), '2026-08-25');
  assert.equal(formatToPeriodDocumentDate('2026-08-25'), '«25» Август 2026г.');
});

test('TO period Google Sheet nomi oy va yil bo‘yicha barqaror', () => {
  assert.equal(periodSheetTitle(2026, 8), 'ТО — Август 2026');
  assert.equal(periodSheetTitle(2026, 9), 'ТО — Сентябрь 2026');
});

test('TO API period yaratish va ikki tomonlama Sheets sync endpointlarini beradi', () => {
  assert.match(route, /router\.post\('\/periods'/);
  assert.match(route, /sync-to-sheet/);
  assert.match(route, /sync-from-sheet/);
  assert.match(route, /documents:create/);
  assert.match(route, /ensureToPeriodSheet/);
});


test('TO optional period lookup returns an empty successful bundle instead of expected 404 noise', () => {
  assert.match(route, /req\.query\.optional/);
  assert.match(route, /exists:\s*false,\s*period:\s*null,\s*items:\s*\[\]/);
  assert.match(route, /exists:\s*true/);
});

test('davr varaqasi nomi dash, register va nusxa belgilariga chidamli normallashadi', () => {
  const canonical = normalizeSheetTitle('ТО — Октябрь 2026');
  assert.equal(canonical, normalizeSheetTitle('ТО - Октябрь 2026'));
  assert.equal(canonical, normalizeSheetTitle('ТО – Октябрь 2026 '));
  assert.equal(canonical, normalizeSheetTitle('то — октябрь 2026'));
  assert.equal(canonical, normalizeSheetTitle('ТО —  Октябрь  2026'));
  assert.equal(canonical, normalizeSheetTitle('Копия: ТО — Октябрь 2026'));
  assert.equal(canonical, normalizeSheetTitle('ТО — Октябрь 2026 (копия)'));
  assert.equal(canonical, normalizeSheetTitle('Copy of ТО — Октябрь 2026'));
  assert.notEqual(canonical, normalizeSheetTitle('ТО — Ноябрь 2026'));
});

test('findPeriodSheets aniq nomni afzal ko radi va dublikatlarni ro yxatlaydi', () => {
  const sheets = [
    { properties: { sheetId: 1, title: 'ТО - Октябрь 2026' } },
    { properties: { sheetId: 2, title: 'ТО — Октябрь 2026' } },
    { properties: { sheetId: 3, title: 'ТО — Октябрь 2026 (копия)' } },
    { properties: { sheetId: 4, title: 'База' } },
  ];
  const { preferred, matches } = findPeriodSheets(sheets, 'ТО — Октябрь 2026');
  assert.equal(preferred.properties.sheetId, 2);
  assert.equal(matches.length, 3);

  const withoutExact = findPeriodSheets(sheets.filter((s) => s.properties.sheetId !== 2), 'ТО — Октябрь 2026');
  assert.equal(withoutExact.preferred.properties.sheetId, 1);
  assert.equal(withoutExact.matches.length, 2);

  const none = findPeriodSheets(sheets, 'ТО — Январь 2026');
  assert.equal(none.preferred, null);
  assert.equal(none.matches.length, 0);
});

test('TO API dublikat varaqalarni birlashtirish endpointini beradi', () => {
  assert.match(route, /router\.post\('\/periods\/:year\/:month\/dedup-sheets'/);
  assert.match(route, /mergeDuplicateToPeriodSheets/);
  assert.match(route, /requireToManageSheets\s*=\s*requireWorkspaceRequestPermission\('workspace:update'\)/);
});

test('duplicate sheet merge copies only missing F:H cells when other data matches', () => {
  const canonical = [['Asset 1', 'Tag 1', '', '', 'Type', 'OK', '', '']];
  const duplicate = [['Asset 1', 'Tag 1', '', '', 'Type', '', 'Repair', 'Note']];
  const plan = planDuplicatePeriodSheetMerge(canonical, duplicate, 'Copy of period');

  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.copiedCells, [{
    sheet: 'Copy of period',
    row: 1,
    values: ['OK', 'Repair', 'Note'],
  }]);
});

test('duplicate sheet merge blocks deletion when any values conflict', () => {
  const canonical = [['Asset 1', '', '', '', '', 'OK', '', '']];
  const duplicate = [['Asset 2', '', '', '', '', 'Other', '', '']];
  const plan = planDuplicatePeriodSheetMerge(canonical, duplicate, 'Copy of period');

  assert.deepEqual(plan.conflicts, [
    { sheet: 'Copy of period', row: 1, column: 'A', reason: 'other-data-differs' },
    { sheet: 'Copy of period', row: 1, column: 'F', reason: 'conflicting-edit' },
  ]);
});
