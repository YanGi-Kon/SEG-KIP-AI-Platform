import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const i18n = fs.readFileSync(new URL('../public/js/i18n.js', import.meta.url), 'utf8');

test('6. ALMASHISH JURNALI is removed from the user interface and module router', () => {
  assert.doesNotMatch(index, /openModulePage\('replacement'/);
  assert.doesNotMatch(index, /6\. АЛМАШИШ ЖУРНАЛИ/);
  assert.doesNotMatch(app, /replacement\s*:/);
  assert.doesNotMatch(app, /replacement:'АЛМАШИШ ЖУРНАЛИ'/);
  assert.doesNotMatch(i18n, /6\. АЛМАШИШ ЖУРНАЛИ/);
  assert.doesNotMatch(i18n, /Алмаштириш тарихи/);
  assert.match(index, /5\. АКТ ВЫПОЛНЕННЫХ РАБОТ/);
  assert.match(index, /7\. ПОЛЬЗОВАТЕЛИ/);
});
