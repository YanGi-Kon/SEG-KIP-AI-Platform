import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DEFAULT_RENDER_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function clean(value) {
  return String(value ?? '').trim();
}

function rendererError(message, code, statusCode = 500, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  Object.assign(error, details);
  return error;
}

function bufferStartsWith(buffer, prefix) {
  return buffer.length >= prefix.length && buffer.subarray(0, prefix.length).equals(prefix);
}

function chromiumCandidates(env = process.env, platform = process.platform) {
  const configured = [
    env.PUPPETEER_EXECUTABLE_PATH,
    env.CHROMIUM_PATH,
    env.CHROME_BIN,
  ].map(clean).filter(Boolean);
  if (platform === 'win32') {
    return configured.concat([
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ]);
  }
  if (platform === 'darwin') {
    return configured.concat([
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ]);
  }
  return configured.concat([
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ]);
}

export function resolveChromiumExecutablePath(options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const candidates = chromiumCandidates(options.env, options.platform);
  return candidates.find((candidate) => existsSync(candidate)) || '';
}

export function assertPdfBuffer(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || '');
  if (!buffer.length) {
    throw rendererError('PDF buffer bo\u2018sh.', 'FINAL_PDF_BYTES_EMPTY', 500);
  }
  if (!bufferStartsWith(buffer, PDF_MAGIC)) {
    throw rendererError('Renderer haqiqiy PDF buffer qaytarmadi.', 'FINAL_PDF_SIGNATURE_INVALID', 500);
  }
  return buffer;
}

function assertPngBuffer(value, maxImageBytes = DEFAULT_MAX_IMAGE_BYTES) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || '');
  if (!buffer.length || buffer.length > maxImageBytes || !bufferStartsWith(buffer, PNG_MAGIC)) {
    throw rendererError(
      'PDF imzo rasmi haqiqiy PNG emas yoki ruxsat etilgan hajmdan katta.',
      'FINAL_PDF_SIGNATURE_IMAGE_INVALID',
      400,
    );
  }
  return buffer;
}

function decodeDataPng(source, maxImageBytes) {
  const match = clean(source).match(/^data:image\/png;base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  return assertPngBuffer(Buffer.from(match[1].replace(/\s+/g, ''), 'base64'), maxImageBytes);
}

function signatureTokenFromSource(source) {
  const match = clean(source).match(/\/api\/signature\/render\/([^/?#]+)/i);
  if (!match) return '';
  try { return decodeURIComponent(match[1]); } catch (_) { return ''; }
}

export async function inlinePdfSignatureImages(
  html,
  { imageResolver, maxImageBytes = DEFAULT_MAX_IMAGE_BYTES } = {},
) {
  const source = String(html || '');
  const imagePattern = /<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/giu;
  const imageSources = [...source.matchAll(imagePattern)].map((match) => match[2]);
  if (!imageSources.length) return { html: source, imageCount: 0 };

  let output = source;
  let imageCount = 0;
  for (const imageSource of [...new Set(imageSources)]) {
    const embedded = decodeDataPng(imageSource, maxImageBytes);
    if (embedded) {
      imageCount += 1;
      continue;
    }

    const token = signatureTokenFromSource(imageSource);
    if (!token || typeof imageResolver !== 'function') {
      throw rendererError(
        'PDF ichidagi tashqi yoki blob imzo rasmi xavfsiz PNG data URL\u2019ga aylantirilmadi.',
        'FINAL_PDF_SIGNATURE_IMAGE_SOURCE_UNSUPPORTED',
        400,
      );
    }
    const resolved = await imageResolver(token);
    const png = assertPngBuffer(resolved?.buffer ?? resolved?.bytes ?? resolved, maxImageBytes);
    const mimeType = clean(resolved?.mimeType || 'image/png').toLowerCase();
    if (mimeType !== 'image/png') {
      throw rendererError('Imzo fayli PNG formatida emas.', 'FINAL_PDF_SIGNATURE_IMAGE_INVALID', 400);
    }
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
    output = output.split(imageSource).join(dataUrl);
    imageCount += 1;
  }
  return { html: output, imageCount };
}

async function waitForDocumentAssets(page, timeoutMs) {
  await page.evaluate(async (assetTimeoutMs) => {
    if (document.fonts?.ready) await document.fonts.ready;
    const images = Array.from(document.images);
    await Promise.all(images.map(async (img) => {
      if (img.complete && img.naturalWidth > 0) {
        if (typeof img.decode === 'function') await img.decode();
        return;
      }
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('IMAGE_LOAD_TIMEOUT')), assetTimeoutMs);
        img.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
        img.addEventListener('error', () => { clearTimeout(timer); reject(new Error('IMAGE_LOAD_FAILED')); }, { once: true });
      });
      if (!img.naturalWidth || !img.naturalHeight) throw new Error('IMAGE_EMPTY');
    }));
  }, Math.min(timeoutMs, 15_000));
}

async function fitSingleA4Page(page) {
  const result = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:100mm;height:100mm';
    document.body.appendChild(probe);
    const pxPerMm = probe.getBoundingClientRect().height / 100;
    probe.remove();
    const availableHeight = 281 * pxPerMm;
    const measure = () => Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      document.querySelector('.a4-preview')?.getBoundingClientRect().height || 0,
    );
    const attempts = [{ density: 'default', height: measure() }];
    if (attempts[0].height > availableHeight + 1) {
      document.body.classList.add('pdf-density-compact');
      attempts.push({ density: 'compact', height: measure() });
    }
    if (attempts.at(-1).height > availableHeight + 1) {
      document.body.classList.add('pdf-density-tight');
      attempts.push({ density: 'tight', height: measure() });
    }
    return { availableHeight, attempts, fits: attempts.at(-1).height <= availableHeight + 1 };
  });
  if (!result.fits) {
    throw rendererError(
      'A4 akt mazmuni o\u2018qiladigan minimal maketda bitta sahifaga sig\u2018madi.',
      'FINAL_PDF_CONTENT_OVERFLOW',
      400,
      { layout: result },
    );
  }
  return result;
}

export async function inspectPdfBuffer(value) {
  const buffer = assertPdfBuffer(value);
  const pdf = await PDFDocument.load(buffer, { updateMetadata: false });
  const pages = pdf.getPages();
  const firstPage = pages[0];
  return {
    pageCount: pages.length,
    width: firstPage?.getWidth() || 0,
    height: firstPage?.getHeight() || 0,
    size: buffer.length,
  };
}

export async function renderHtmlToA4Pdf(html, options = {}) {
  const executablePath = clean(options.executablePath) || resolveChromiumExecutablePath(options);
  if (!executablePath) {
    throw rendererError(
      'Chromium executable topilmadi. PUPPETEER_EXECUTABLE_PATH ni sozlang.',
      'FINAL_PDF_CHROMIUM_NOT_FOUND',
      500,
    );
  }
  const timeoutMs = Math.max(5_000, Number(options.timeoutMs || DEFAULT_RENDER_TIMEOUT_MS));
  const browser = await (options.launch || puppeteer.launch)({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  }).catch((error) => {
    throw rendererError(
      `Chromium ishga tushmadi: ${clean(error?.message)}`,
      'FINAL_PDF_CHROMIUM_LAUNCH_FAILED',
      500,
    );
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);
    await page.emulateMediaType('print');
    await page.setContent(String(html || ''), { waitUntil: 'networkidle0', timeout: timeoutMs });
    await waitForDocumentAssets(page, timeoutMs);
    await fitSingleA4Page(page);
    const value = await page.pdf({
      format: 'A4',
      landscape: false,
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
    });
    const buffer = assertPdfBuffer(Buffer.from(value));
    const inspection = await inspectPdfBuffer(buffer);
    if (inspection.pageCount !== 1) {
      throw rendererError(
        `Yakuniy PDF ${inspection.pageCount} sahifali bo\u2018lib qoldi.`,
        'FINAL_PDF_PAGE_COUNT_INVALID',
        400,
        { inspection },
      );
    }
    if (Math.abs(inspection.width - A4_WIDTH_PT) > 2 || Math.abs(inspection.height - A4_HEIGHT_PT) > 2) {
      throw rendererError(
        'Yakuniy PDF MediaBox o\u2018lchami A4 emas.',
        'FINAL_PDF_PAGE_SIZE_INVALID',
        400,
        { inspection },
      );
    }
    return buffer;
  } finally {
    await browser.close().catch(() => {});
  }
}
