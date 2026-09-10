import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const actsHtml = fs.readFileSync(new URL('../public/modules/acts.html', import.meta.url), 'utf8');
const actsUi = fs.readFileSync(new URL('../public/js/acts.js', import.meta.url), 'utf8');
const signersUi = fs.readFileSync(new URL('../public/js/acts-workspace-signers.js', import.meta.url), 'utf8');

test('act signer F.I.O fields are explicit dropdowns', () => {
  for (const slot of [1, 2, 3]) {
    assert.match(actsHtml, new RegExp(`<select id="person${slot}"`));
  }
  assert.match(actsUi, /renderSignerSelectOptions\(state\.workspaceApprovers\)/);
  assert.match(actsUi, /activeSignerRows\(rows\)/);
});

test('selecting a signer automatically fills its position', () => {
  assert.match(actsUi, /function handleSignerSelection\(slot\)/);
  assert.match(actsUi, /position\.value=clean\(signer\?\.position\)/);
  assert.match(actsUi, /addEventListener\('change',\(\)=>handleSignerSelection\(slot\)\)/);
});

test('signer registry changes refresh document dropdowns', () => {
  assert.match(actsUi, /refreshSignerChoices/);
  assert.match(signersUi, /ActsUI\?\.refreshSignerChoices/);
});
