import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const chromePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => fs.existsSync(path));
test('kachalka follows independent loading states without changing status text', {skip: !chromePath}, async () => {
  const browser = await puppeteer.launch({
    executablePath: chromePath, headless: true, timeout: 60000, pipe: true,
    args: process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(`<div id="segAppLoader">Sanegplatform yuklanmoqda...</div>
      <span id="period">Davr yuklanmoqda...</span><span id="analysis">Октябрь 2026 · юкланмоқда...</span>
      <div id="done">Tayyor</div><select id="choice"><option>Загрузка...</option><option>Tayyor</option></select>`);
    await page.addScriptTag({content: fs.readFileSync(new URL('../public/js/kachalka.js', import.meta.url), 'utf8')});
    await page.waitForFunction(() => document.querySelectorAll('[data-kachalka]').length === 3);
    assert.equal(await page.$eval('#segAppLoader', el => el.querySelector('[data-kachalka]')), null);
    assert.equal(await page.$eval('#period', el => el.firstChild.textContent), 'Davr yuklanmoqda...');
    await page.evaluate(() => {
      document.getElementById('period').textContent = 'Tayyor';
      document.getElementById('done').textContent = 'Saqlanmoqda...';
      const select = document.getElementById('choice');
      select.selectedIndex = 1; select.dispatchEvent(new Event('change', {bubbles:true}));
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-kachalka]').length === 2 && document.querySelector('#done [data-kachalka]'));
    await page.evaluate(() => {
      document.getElementById('analysis').textContent = 'Xato: server javob bermadi';
      document.getElementById('done').remove();
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-kachalka]').length === 0);
    await page.evaluate(() => {
      document.getElementById('period').innerHTML = '<span>Hisobotlar yuklanmoqda...</span>';
      window.segKachalka.refresh(); window.segKachalka.refresh();
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-kachalka]').length === 1);
    assert.equal(await page.$eval('[data-kachalka] img', el => el.getAttribute('src')), '/assets/images/saneg-loading.gif');
    assert.match(await page.$eval('[data-kachalka] img', el => getComputedStyle(el).filter), /#segLoaderBackgroundKey/);
  } finally { await browser.close(); }
});
