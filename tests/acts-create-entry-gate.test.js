import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const actsUi = fs.readFileSync(new URL('../public/js/acts.js', import.meta.url), 'utf8');
const gateUi = fs.readFileSync(new URL('../public/js/acts-personal-drive-settings.js', import.meta.url), 'utf8');

test('Acts document creation tab is gated until a draft is opened from analysis', () => {
  assert.match(gateUi, /tab\.disabled=!createIsOpen/);
  assert.match(gateUi, /id==='create'&&!createView\.classList\.contains\('active'\)/);
  assert.match(gateUi, /Аввал 1\. Ойлик анализдан «Хужат яратиш» тугмасини босинг/);
});

test('Analysis row create action still opens the create view internally', () => {
  assert.match(actsUi, /ActsUI\.fillDoc\(\$\{i\}\)/);
  assert.match(actsUi, /async function fillDoc\(index\)[\s\S]*?showView\('create',\$\('tab-create'\)\)/);
});
