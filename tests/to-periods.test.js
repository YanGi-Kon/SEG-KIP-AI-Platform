import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildToPeriodItems,
  deriveToDocumentDate,
} from '../services/toPeriodService.js';
import {
  formatToPeriodDocumentDate,
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
