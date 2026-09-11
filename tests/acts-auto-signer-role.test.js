import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../public/js/acts.js', import.meta.url), 'utf8');

test('AKTLAR automatic signature matcher uses only NUVvaA target positions', () => {
  assert.match(source, /function isAutomaticSignatureSigner/);
  assert.match(source, /position\.includes\('нувваа чилангари'\)/);
  assert.match(source, /position\.includes\('нувваа устаси'\)/);
  assert.doesNotMatch(source, /text\.includes\('кип'\).*text\.includes\('мастер'\)/);
  assert.doesNotMatch(source, /text\.includes\('kip'\).*text\.includes\('master'\)/);
});

test('AKTLAR still auto-selects the matching signer into the first empty signer slot', () => {
  assert.match(source, /function findAutomaticSignatureSigner/);
  assert.match(source, /activeRows\.find\(isAutomaticSignatureSigner\)/);
  assert.match(source, /function applyAutomaticSignatureSignerFromApprovers/);
  assert.match(source, /person1 && !person1\.value\.trim\(\)/);
});


test('automatic role signature is not limited to the first signer slot', () => {
  assert.match(source, /const automaticSigner=isAutomaticSignatureSigner/);
  assert.doesNotMatch(source, /slot===1&&isAutomaticSignatureSigner/);
  assert.match(source, /automaticSignatureUrls\[\`signatureUrl\$\{slot\}\`\]/);
});
