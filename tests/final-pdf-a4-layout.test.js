import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../services/finalPdfExportService.js', import.meta.url), 'utf8');
const wrapBlock = source.match(/function wrapHtmlForPdf\([\s\S]*?\n\}/)?.[0] || '';

test('final PDF uses a compact printable A4 page', () => {
  assert.match(wrapBlock, /@page\{size:A4 portrait;margin:8mm\}/);
  assert.match(wrapBlock, /\.pdf-wrap\{margin:0;padding:0;width:100%\}/);
  assert.match(wrapBlock, /\.a4-preview\{width:100%;max-width:none;min-height:0;margin:0;padding:6mm 10mm/);
  assert.doesNotMatch(wrapBlock, /min-height:297mm/);
});

test('final signatures stay together and compact on the A4 export', () => {
  assert.match(wrapBlock, /\.act-final-signatures\{[^}]*page-break-inside:avoid/);
  assert.match(wrapBlock, /\.act-final-signature-value\{[^}]*min-height:47px/);
  assert.match(wrapBlock, /\.act-signature-box\{[^}]*height:44px/);
});
