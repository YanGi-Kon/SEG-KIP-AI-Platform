import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const actsRoute = fs.readFileSync(new URL('../routes/acts.js', import.meta.url), 'utf8');
const actsService = fs.readFileSync(new URL('../services/actBlankSheetService.js', import.meta.url), 'utf8');
const actsUi = fs.readFileSync(new URL('../public/js/acts.js', import.meta.url), 'utf8');
const actsHtml = fs.readFileSync(new URL('../public/modules/acts.html', import.meta.url), 'utf8');

test('acts report rows expose a functional delete action', () => {
  assert.match(actsUi, /ActsUI\.deleteReport/);
  assert.match(actsUi, />Учириш<\/button>/);
  assert.match(actsUi, /method:'DELETE'/);
  assert.match(actsHtml, /acts\.js\?v=20260911-nuvaa-auto-signer-any-slot-2/);
});

test('acts report delete endpoint requires cancel permission', () => {
  assert.match(actsRoute, /requireWorkspaceRequestPermission\('documents:cancel'\)/);
  assert.match(actsRoute, /router\.delete\('\/reports\/daily\/:actNo', requireActsDelete/);
  assert.match(actsRoute, /deleteActDocument/);
});

test('deleting an act removes its registry row and clears its daily sheet block', () => {
  assert.match(actsService, /export async function deleteActDocument/);
  assert.match(actsService, /unmergeCells/);
  assert.match(actsService, /updateCells/);
  assert.match(actsService, /deleteDimension/);
});
