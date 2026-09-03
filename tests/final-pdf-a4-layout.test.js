import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapHtmlForPdf } from '../services/finalPdfExportService.js';

const wrapped = wrapHtmlForPdf('<div class="a4-preview">TEST</div>', 'AKT-001');

test('final PDF uses a compact printable A4 page', () => {
  assert.match(wrapped, /@page\{size:A4 portrait;margin:8mm\}/);
  assert.match(wrapped, /\.pdf-wrap\{margin:0;padding:0;width:100%\}/);
  assert.match(wrapped, /\.a4-preview\{width:100%;max-width:none;min-height:0;margin:0;padding:6mm 10mm/);
  assert.doesNotMatch(wrapped, /min-height:297mm/);
});

test('final signatures stay together and compact on the A4 export', () => {
  assert.match(wrapped, /\.act-final-signatures\{[^}]*page-break-inside:avoid/);
  assert.match(wrapped, /\.act-final-signature-value\{[^}]*min-height:47px/);
  assert.match(wrapped, /\.act-signature-box\{[^}]*height:44px/);
  assert.match(wrapped, /\.act-signers \.act-signature-box\{display:none!important\}/);
});
