import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/modules/faults.html', import.meta.url), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

test('faults module contains the requested common journal window', () => {
  assert.match(html, /НОСОЗЛИКЛАР ЖУРНАЛИ/);
  assert.match(html, /ОБЩИЙ ЖУРНАЛ \/ БАЗА/);
  assert.doesNotMatch(html, /Sex ID|faultsSection/);
  assert.match(html, /id="faultsStatus"/);
  assert.match(html, /id="faultsSearch"/);
  assert.match(html, /id="faultsStatusFilter"/);
  assert.match(html, /id="faultsRows"/);
});

test('faults frontend exposes add, edit, delete and local persistence flows', () => {
  assert.ok(scriptMatch, 'inline journal script must exist');
  assert.doesNotThrow(() => new Function(scriptMatch[1]));
  assert.match(scriptMatch[1], /function openModal/);
  assert.match(scriptMatch[1], /function saveForm/);
  assert.match(scriptMatch[1], /function removeRow/);
  assert.match(scriptMatch[1], /localStorage/);
});
