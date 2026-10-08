import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const chromePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => fs.existsSync(path));
test('one shared kachalka follows loading states without changing status text', {skip: !chromePath}, async () => {
  const browser = await puppeteer.launch({
    executablePath: chromePath, headless: true, timeout: 60000, pipe: true,
    args: process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(`<div id="description">Модуль загружается из отдельного HTML файла</div>
      <div id="ulchovDescription">Загружается из отдельного файла modules/ulchov.html</div>
      <div data-loading-description>Loading module description</div>
      <span id="period">Davr yuklanmoqda...</span><span id="analysis">Октябрь 2026 · юкланмоқда...</span>
      <div id="done">Tayyor</div><select id="choice"><option>Загрузка...</option><option>Tayyor</option></select>`);
    await page.addScriptTag({content: fs.readFileSync(new URL('../public/js/kachalka.js', import.meta.url), 'utf8')});
    await page.waitForFunction(() => document.querySelector('#segSharedLoader:not([hidden])'));
    assert.equal(await page.$$eval('[data-kachalka]', els => els.length), 1);
    assert.equal(await page.$eval('#segSharedLoader img', el => getComputedStyle(el).width), '200px');
    assert.equal(await page.$eval('#segSharedLoader', el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.equal(await page.$eval('#period', el => el.firstChild.textContent), 'Davr yuklanmoqda...');
    await page.evaluate(() => {
      document.getElementById('period').textContent = 'Tayyor';
      document.getElementById('done').textContent = 'Saqlanmoqda...';
      const select = document.getElementById('choice');
      select.selectedIndex = 1; select.dispatchEvent(new Event('change', {bubbles:true}));
    });
    await page.waitForFunction(() => document.querySelector('#segSharedLoader:not([hidden])'));
    assert.equal(await page.$$eval('[data-kachalka]', els => els.length), 1);
    await page.evaluate(() => {
      document.getElementById('analysis').textContent = 'Xato: server javob bermadi';
      document.getElementById('done').remove();
    });
    await page.waitForFunction(() => document.querySelector('#segSharedLoader[hidden]'));
    await page.evaluate(() => {
      document.getElementById('ulchovDescription').textContent = 'Загружается из отдельного файла modules/formulyar.html';
      document.getElementById('period').setAttribute('aria-busy', 'true');
    });
    await page.waitForFunction(() => document.querySelector('#segSharedLoader:not([hidden])'));
    await page.evaluate(() => document.getElementById('period').setAttribute('aria-busy','false'));
    await page.waitForFunction(() => document.querySelector('#segSharedLoader[hidden]'));
    await page.evaluate(() => {
      document.getElementById('period').innerHTML = '<span>Hisobotlar yuklanmoqda...</span>';
      window.segKachalka.refresh(); window.segKachalka.refresh();
    });
    await page.waitForFunction(() => document.querySelector('#segSharedLoader:not([hidden])'));
    assert.equal(await page.$eval('[data-kachalka] img', el => el.getAttribute('src')), '/assets/images/saneg-loading.gif');
    assert.match(await page.$eval('[data-kachalka] img', el => getComputedStyle(el).filter), /#segLoaderBackgroundKey/);
  } finally { await browser.close(); }
});
