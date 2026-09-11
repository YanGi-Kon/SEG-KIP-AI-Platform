import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/modules/faults.html', import.meta.url), 'utf8');

test('NOSOZLIKLAR JURNALI oy/yil boshqaruvlarini ko‘rsatadi', () => {
  for (const id of [
    'faultsPrevPeriodBtn',
    'faultsPeriodMonth',
    'faultsPeriodYear',
    'faultsNextPeriodBtn',
    'faultsPeriodStatus',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /MONTH_NAMES=\['Январь'.*'Декабрь'\]/s);
});

test('NOSOZLIKLAR JURNALI AKT hisobotlarini tanlangan davr bo‘yicha filtrlaydi', () => {
  assert.match(html, /function parseReportPeriod/);
  assert.match(html, /function reportPeriod/);
  assert.match(html, /function applyPeriodFilter/);
  assert.match(html, /period\.year===Number\(state\.periodYear\)/);
  assert.match(html, /period\.month===Number\(state\.periodMonth\)/);
  assert.match(html, /navigatePeriod\(-1\)/);
  assert.match(html, /navigatePeriod\(1\)/);
});

test('NOSOZLIKLAR JURNALI tanlangan davrni Workspace bo‘yicha eslab qoladi', () => {
  assert.match(html, /PERIOD_STORAGE_PREFIX='seg_faults_period_v1'/);
  assert.match(html, /function periodStorageKey/);
  assert.match(html, /function readSavedPeriod/);
  assert.match(html, /function saveSelectedPeriod/);
  assert.match(html, /function restoreSavedPeriod/);
  assert.match(html, /restoreSavedPeriod\(nextId\)/);
});

test('NOSOZLIKLAR JURNALI inline JS sintaksisi yaroqli', () => {
  const match = html.match(/<script>\s*\(function setupFaultsJournalFrontend\(\)\{([\s\S]*?)\}\)\(\);\s*<\/script>/);
  assert.ok(match, 'faults inline script topilmadi');
  assert.doesNotThrow(() => new Function(match[1]));
});
