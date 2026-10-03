import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const i18n = fs.readFileSync(new URL('../public/js/i18n.js', import.meta.url), 'utf8');

test('acts journal menu is renamed to defect act without changing module route', () => {
  assert.match(index, /openModulePage\('acts', 'SEG KIP AI Platform — Дефектный акт'\)/);
  assert.match(index, /data-i18n="3\. ДЕФЕКТНЫЙ АКТ">3\. ДЕФЕКТНЫЙ АКТ</);
  assert.match(index, /data-i18n="Дефектный акт">Дефектный акт</);
  assert.match(index, /js\/i18n\.js\?v=20261003-defect-act1/);
  assert.doesNotMatch(index, /data-i18n="3\. АКТЛАР ЖУРНАЛИ"/);
  assert.doesNotMatch(index, /data-i18n="Актлар архиви"/);
});

test('defect act menu has translations for all supported languages', () => {
  assert.match(i18n, /'3\. ДЕФЕКТНЫЙ АКТ': '3\. ДЕФЕКТНЫЙ АКТ'/);
  assert.match(i18n, /'3\. ДЕФЕКТНЫЙ АКТ': '3\. DEFEKT AKTI'/);
  assert.match(i18n, /'3\. ДЕФЕКТНЫЙ АКТ': '3\. DEFECT REPORT'/);
  assert.match(i18n, /'3\. ДЕФЕКТНЫЙ АКТ': '3\. ДЕФЕКТ АКТИ'/);
  assert.match(i18n, /'Дефектный акт': 'Дефектный акт'/);
  assert.match(i18n, /'SEG KIP AI Platform — Дефектный акт': 'SEG KIP AI Platform — Дефектный акт'/);
});
