import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../public/js/acts.js', import.meta.url), 'utf8');
const moduleHtml = fs.readFileSync(new URL('../public/modules/acts.html', import.meta.url), 'utf8');

test('A4 document adds protected final signatures after the conclusion', () => {
  assert.match(source, /SEG_FINAL_SIGNATURES_START/);
  assert.match(source, /act-final-signatures-title/);
  assert.match(source, /Лавозими/);
  assert.match(source, /Имзо/);
  assert.match(source, /Ф\.И\.Ш\./);
  assert.match(source, /<div class="act-conclusion">[\s\S]*\$\{buildFinalSignatures\(a\)\}/);
});

test('final signature block preserves all three signed image slots', () => {
  assert.match(source, /buildFinalSignatureRows\(a\)/);
  assert.match(source, /\[1,2,3\]\.map/);
  assert.match(source, /SEG_SIGNATURE_SLOT_\$\{signatureSlot\}_START/);
  assert.match(source, /page-break-inside:avoid/);
});

test('upper signer information block has no electronic signature slots', () => {
  const buildRows = source.match(/function buildSignerRows\(a\)\{[\s\S]*?\n  \}/)?.[0] || '';
  assert.doesNotMatch(buildRows, /signatureUrl/);
  assert.doesNotMatch(buildRows, /SEG_SIGNATURE_SLOT/);
});

test('Acts module cache version exposes the final signatures build', () => {
  assert.match(moduleHtml, /acts\.js\?v=20260902-final-signatures-2/);
});

test('document editor shows the same three-row signatures preview below conclusion', () => {
  assert.match(moduleHtml, /id="conclusion"[\s\S]*id="draftFinalSignatures"/);
  assert.match(source, /function renderDraftFinalSignatures\(\)/);
  assert.match(source, /refreshDraftSignatureImages/);
});
