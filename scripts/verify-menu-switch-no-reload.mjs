// Diagnoses whether switching sidebar menus reloads module documents or re-shows the boot loader.
// Requires a running local server (npm run dev:local) and its credentials file.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.DIAG_BASE_URL || 'http://localhost:3001';
const credentialsPath = path.resolve(process.env.LOCAL_DEV_CREDENTIALS_PATH || path.join(projectDir, 'tmp', 'local-dev-credentials.txt'));
const executablePath = process.env.CHROME_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const STEP_WAIT_MS = Number(process.env.DIAG_STEP_WAIT_MS || 4000);

const content = await fs.readFile(credentialsPath, 'utf8');
const email = content.match(/^email=(.+)$/m)?.[1]?.trim();
const password = content.match(/^password=(.+)$/m)?.[1]?.trim();
if (!email || !password) throw new Error(`Local credentials not found: ${credentialsPath}`);

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1600,1000'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  const mainNavigations = [];
  const moduleRequests = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) mainNavigations.push({ url: frame.url(), t: Date.now() });
  });
  page.on('request', (req) => {
    if (req.resourceType() === 'document' && /\/modules\/.+\.html/.test(req.url())) {
      moduleRequests.push({ url: req.url(), t: Date.now() });
    }
  });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const login = await page.evaluate(async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, email, password);
  if (login.status !== 200) throw new Error(`Login failed: ${login.status} ${JSON.stringify(login.body)}`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.menu-item', { timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 3000));

  await page.evaluate(() => {
    window.__diag = { steps: [], iframeLoads: [], loaderTransitions: [] };
    window.__diagStep = 'boot';
    const attach = (frame) => {
      if (frame.dataset?.diagWatched === 'true') return;
      frame.dataset.diagWatched = 'true';
      frame.addEventListener('load', () => {
        window.__diag.iframeLoads.push({ step: window.__diagStep, id: frame.id || '(no-id)', src: frame.getAttribute('src'), t: Date.now() });
      });
    };
    document.querySelectorAll('iframe').forEach(attach);
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'IFRAME') attach(node);
          node.querySelectorAll?.('iframe').forEach(attach);
        }
      }
    }).observe(document.body, { subtree: true, childList: true });

    let lastVisible = null;
    setInterval(() => {
      const el = document.getElementById('segAppLoader');
      const visible = Boolean(el) && el.style.display !== 'none' && !el.classList.contains('is-hidden');
      if (visible !== lastVisible) {
        lastVisible = visible;
        window.__diag.loaderTransitions.push({ step: window.__diagStep, visible, t: Date.now() });
      }
    }, 150);
  });
  mainNavigations.length = 0;
  moduleRequests.length = 0;

  const MENU = { journal: 0, ulchov: 1, acts: 2, faults: 3, to: 4, users: 5, settings: 6 };
  const sequence = ['journal', 'acts', 'journal', 'to', 'journal', 'ulchov', 'journal', 'settings', 'journal', 'acts', 'faults', 'faults'];

  for (const name of sequence) {
    await page.evaluate((step, index) => {
      window.__diagStep = step;
      window.__diag.steps.push({ step, t: Date.now() });
      document.querySelectorAll('.menu-item')[index]?.click();
    }, `click:${name}`, MENU[name]);
    await new Promise((resolve) => setTimeout(resolve, STEP_WAIT_MS));
  }

  const diag = await page.evaluate(() => ({
    steps: window.__diag.steps,
    iframeLoads: window.__diag.iframeLoads,
    loaderTransitions: window.__diag.loaderTransitions,
    frames: Array.from(document.querySelectorAll('#genericModulePage iframe, #ulchovIntegratedPage iframe'))
      .map((frame) => ({ id: frame.id, src: frame.getAttribute('src'), hidden: frame.hidden })),
  }));

  console.log(JSON.stringify({ mainNavigations, moduleRequests, ...diag }, null, 2));
} finally {
  await browser.close();
}
