import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inlinePdfSignatureImages,
  inspectPdfBuffer,
  renderHtmlToA4Pdf,
  resolveChromiumExecutablePath,
} from '../services/pdfRendererService.js';
import { wrapHtmlForPdf } from '../services/finalPdfExportService.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const PNG = Buffer.from(PNG_BASE64, 'base64');

function signature(slot) {
  return `<span class="act-signature-box" data-approved-signature-slot="${slot}"><img src="data:image/png;base64,${PNG_BASE64}" alt="Имзо"></span>`;
}

function signerRows({ signed = true } = {}) {
  return [1, 2, 3].map((slot) => `<div class="act-signers-row"><div class="act-signers-cell"><div class="act-signers-value">Ф.И.Ш. ${slot}</div><div class="act-signers-label">Ф.И.Ш.</div></div><div class="act-signers-cell"><div class="act-signers-value">Лавозим ${slot}</div><div class="act-signers-label">лавозим</div></div><div class="act-signers-cell"><div class="act-signers-value">Цех ${slot}</div><div class="act-signers-label">цех ва и/ж.</div></div></div>`).join('');
}

function finalSignatureRows() {
  return [1, 2, 3].map((slot) => `<div class="act-final-signature-row"><div class="act-final-signature-cell"><div class="act-final-signature-value">Лавозим ${slot}</div><div class="act-final-signature-label">Лавозими</div></div><div class="act-final-signature-cell"><div class="act-final-signature-value">${signature(slot)}</div><div class="act-final-signature-label">Имзо</div></div><div class="act-final-signature-cell"><div class="act-final-signature-value">Ф.И.Ш. ${slot}</div><div class="act-final-signature-label">Ф.И.Ш.</div></div></div>`).join('');
}

function section(title, value, className = '') {
  return `<div class="act-section"><div class="act-section-title">${title}</div><div class="act-section-value ${className}">${value}</div></div>`;
}

function sampleAct(long = false) {
  const extra = long
    ? ' Ускуна ҳолати навбатчи мутахассислар билан текширилди, технологик xavfsizlik choralariga rioya qilindi.'.repeat(8)
    : '';
  return `<div class="a4-preview"><div class="act-meta"><div class="act-date-head">"03" сентябрь 2026 г.</div><div class="right">Низомга илова №4<br>“SANEG” МЧЖ<br>ТПП «Андижан»</div></div><div class="act-head"><div class="act-title"><span>ДАЛОЛАТНОМА №</span><span class="act-no-line">AKT-TEST-2026-001</span></div><div class="act-subtitle">Ўлчов воситасининг бузилиши</div></div><div class="act-signers"><div class="act-signers-title">Далолатнома тузувчилар:</div>${signerRows()}</div>${section('1. Ў.В. Ишлаш жойи', 'Андижон К/К, 12-сонли қудуқ')}${section('2. Рад этиш мазмуни, санаси, вақти:', `Босим ўлчагич сигнал бермади.${extra}`)}${section('3. Носозликнинг технологик оқибатлари:', `Назорат сигнали вақтинча мавжуд эмас.${extra}`, 'tall')}${section('4. Рад этиш сабаби:', `Импульс линиясида тиқилиш аниқланди.${extra}`, 'tall')}${section('5. Носозликни бартараф этиш бўйича оператив ҳаракатлар ва бартараф этиш вақти:', `Импульс линияси тозаланди ва асбоб қайта текширилди.${extra}`, 'xl')}<div class="act-conclusion">${section('Хулоса:', `Ўлчов воситаси ишга яроқли ҳолатга келтирилди.${extra}`, 'xl')}</div><!--SEG_FINAL_SIGNATURES_START--><div class="act-final-signatures"><div class="act-final-signatures-title">Имзолар:</div><div class="act-final-signatures-grid">${finalSignatureRows()}</div></div><!--SEG_FINAL_SIGNATURES_END--></div>`;
}

test('protected signature URLs are converted to verified PNG data URLs', async () => {
  const source = '<div class="act-final-signatures"><img src="https://platform.example/api/signature/render/signed-token"></div>';
  const result = await inlinePdfSignatureImages(source, {
    imageResolver: async (token) => {
      assert.equal(token, 'signed-token');
      return { buffer: PNG, mimeType: 'image/png' };
    },
  });
  assert.equal(result.imageCount, 1);
  assert.match(result.html, /src="data:image\/png;base64,/);
  assert.doesNotMatch(result.html, /platform\.example/);
});

test('blob or arbitrary external images are rejected before Chromium render', async () => {
  await assert.rejects(
    inlinePdfSignatureImages('<img src="blob:unsafe">'),
    { code: 'FINAL_PDF_SIGNATURE_IMAGE_SOURCE_UNSUPPORTED' },
  );
});

test('Chromium creates one portrait A4 page with all final act sections', { timeout: 45_000 }, async (t) => {
  const executablePath = resolveChromiumExecutablePath();
  if (!executablePath) return t.skip('Chromium executable is not installed');
  const html = wrapHtmlForPdf(sampleAct(false), 'AKT-TEST-2026-001');
  for (const requiredText of [
    'AKT-TEST-2026-001',
    '1. Ў.В. Ишлаш жойи',
    '2. Рад этиш мазмуни',
    '3. Носозликнинг технологик оқибатлари',
    '4. Рад этиш сабаби',
    '5. Носозликни бартараф этиш',
    'Хулоса:',
    'Имзолар:',
  ]) assert.match(html, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const pdf = await renderHtmlToA4Pdf(html, { executablePath });
  const inspection = await inspectPdfBuffer(pdf);
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(inspection.pageCount, 1);
  assert.ok(Math.abs(inspection.width - 595.28) < 2);
  assert.ok(Math.abs(inspection.height - 841.89) < 2);
  assert.equal((html.match(/data-approved-signature-slot=/g) || []).length, 3);
});

test('long act text either fits one page readably or is rejected instead of uploading page two', { timeout: 45_000 }, async (t) => {
  const executablePath = resolveChromiumExecutablePath();
  if (!executablePath) return t.skip('Chromium executable is not installed');
  const html = wrapHtmlForPdf(sampleAct(true), 'AKT-LONG-001');
  try {
    const pdf = await renderHtmlToA4Pdf(html, { executablePath });
    assert.equal((await inspectPdfBuffer(pdf)).pageCount, 1);
  } catch (error) {
    assert.equal(error.code, 'FINAL_PDF_CONTENT_OVERFLOW');
  }
});
