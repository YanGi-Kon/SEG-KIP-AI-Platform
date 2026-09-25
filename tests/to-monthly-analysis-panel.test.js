import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const panel = fs.readFileSync(new URL('../public/js/to-monthly-analysis-panel.js', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../public/js/to-period-sheet-bridge.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const toModule = fs.readFileSync(new URL('../public/modules/to.html', import.meta.url), 'utf8');

test('TO monthly analysis panel is loaded as section 1', () => {
  assert.match(panel, /function init\(\)[\s\S]*window\.setTimeout\(\(\) => open\(\), 0\)/);
  assert.match(toModule, /id="toMonthlyAnalysisBtn"/);
  assert.match(toModule, />1\. Ойлик анализ<\/button>/);
  assert.ok(toModule.indexOf('toMonthlyAnalysisBtn') < toModule.indexOf('toSettingsBtn'));
  assert.match(bridge, /loadMonthlyAnalysisPanel/);
  assert.match(bridge, /to-monthly-analysis-panel\.js\?v=to-analysis5-home/);
  assert.match(panel, /button\.textContent = '1\. Ойлик анализ'/);
  assert.match(panel, /<h2>1\. Ойлик анализ<\/h2>/);
  assert.match(app, /modules\/to\.html\?v=20260925-analysis-home1/);
});

test('TO main workspace shows only monthly analysis on every menu entry', () => {
  assert.doesNotThrow(() => new Function(panel));
  assert.match(panel, /body\.to-analysis-home>\.top-bar/);
  assert.match(panel, /body\.to-analysis-home>\.period-bar/);
  assert.match(panel, /body\.to-analysis-home>\.document-container/);
  assert.match(panel, /body\.to-analysis-home #toMonthlyAnalysisModal\{position:relative/);
  assert.match(panel, /document\.body\.classList\.add\('to-analysis-home'\)/);
  assert.match(panel, /document\.body\.classList\.remove\('to-analysis-home'\)/);
  assert.match(panel, /id="toAnalysisReportsBtn"/);
  assert.match(panel, /id="toAnalysisSignersBtn"/);
  assert.match(panel, /id="toAnalysisFinalBtn"/);
  assert.match(panel, /id="toAnalysisSettingsBtn"/);
  assert.match(panel, /event\.data\?\.type === 'SEG_KIP_TO_OPEN'/);
  assert.match(app, /const isTo = moduleName === 'to'/);
  assert.match(app, /postMessage\(\{ type: 'SEG_KIP_TO_OPEN' \}, '\*'\)/);
});

test('TO monthly analysis reads selected month from ASOSIY VAROQ', () => {
  assert.match(panel, /\/api\/to-period-bridge\/select/);
  assert.match(panel, /year: state\.year, month: state\.month, sheetName: sourceSheet/);
  assert.match(panel, /source\.totalItems/);
  assert.match(panel, /source\.sections/);
  assert.match(panel, /ASOSIY VAROQ/);
});

test('TO monthly analysis checks whether the monthly document already exists', () => {
  assert.match(panel, /\/api\/to\/periods\/\$\{state\.year\}\/\$\{state\.month\}/);
  assert.match(panel, /allow404: true/);
  assert.match(panel, /const created = period \? 1 : 0/);
  assert.match(panel, /const percent = created \? 100 : 0/);
  assert.match(panel, /Яратилган ойлик хужжат/);
});

test('TO monthly analysis adapts Acts flow to one monthly TO document', () => {
  assert.match(panel, /TO учун бир ой битта якуний бажарилган ишлар акти ҳисобланади/);
  assert.match(panel, /Умумий TO қаторлари/);
  assert.match(panel, /Бўлимлар сони/);
  assert.match(panel, /Ойлик хужжат тайёрлиги/);
  assert.match(panel, /action\.textContent = 'Хужат яратиш'/);
  assert.doesNotMatch(panel, /action\.textContent = created \? 'Хужатни очиш'/);
});

test('TO monthly analysis opens a draft and does not create a report before Save', () => {
  assert.match(panel, /openSelectedPeriod\?\.\(\{ fallbackToSource: true \}\)/);
  assert.doesNotMatch(panel, /createSelectedPeriod\?\.\(/);
  assert.match(panel, /state\.sections = Array\.isArray\(state\.source\?\.sections\)/);
  assert.match(panel, /state\.totalItems = Number\(state\.source\?\.totalItems\)/);
  assert.match(panel, /applySignerSelectionsForCurrentPeriod/);
  assert.match(panel, /state\.periodYear = state\.year/);
  assert.match(panel, /state\.periodMonth = state\.month/);
});

test('TO Save is the operation that creates the monthly period and refreshes Reports', () => {
  assert.match(bridge, /async function saveCurrentDocument/);
  assert.match(bridge, /\$\('toCreatePeriodBtn'\)\?\.remove\(\)/);
  assert.match(bridge, /if \(!state\.period\)/);
  assert.match(bridge, /createSelectedPeriod/);
  assert.match(bridge, /refreshReportsAfterSave/);
  assert.match(bridge, /3\. Хисоботлар га сақланди/);
});

test('TO monthly analysis table uses TO source row fields', () => {
  assert.match(panel, /row\.serialNo/);
  assert.match(panel, /row\.equipmentName/);
  assert.match(panel, /row\.positionNo/);
  assert.match(panel, /row\.quantity/);
  assert.match(panel, /row\.technicalState/);
  assert.match(panel, /row\.workType/);
  assert.match(panel, /row\.note/);
});
