import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const workflowSource = fs.readFileSync(new URL('../public/js/kuduk-workflow.js', import.meta.url), 'utf8');
const migrationSource = fs.readFileSync(new URL('../db/migrations/033_journal_reports.sql', import.meta.url), 'utf8');
const routeSource = fs.readFileSync(new URL('../routes/journalReports.js', import.meta.url), 'utf8');
const serviceSource = fs.readFileSync(new URL('../services/journalReportService.js', import.meta.url), 'utf8');
const repositorySource = fs.readFileSync(new URL('../repositories/journalReportRepository.js', import.meta.url), 'utf8');

const chromePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => fs.existsSync(path));
test('journal document table fits inside the paper despite the module table minimum width', {skip: !chromePath}, async () => {
  const browser = await puppeteer.launch({executablePath:chromePath,headless:true,pipe:true,args:process.platform==='linux'?['--no-sandbox','--disable-dev-shm-usage']:[]});
  try {
    const page = await browser.newPage();
    await page.setViewport({width:1600,height:1000});
    const module = fs.readFileSync(new URL('../public/modules/kuduk-journal.html', import.meta.url),'utf8');
    const baseStyle = module.match(/<style>([\s\S]*?)<\/style>/)[1];
    const documentStyle = workflowSource.split('\n').find(line=>line.includes('.kw-doc-body{'));
    await page.setContent(`<style>${baseStyle}${documentStyle}</style><div class="kw-doc-paper"><table class="kw-doc-table"><tbody><tr>${Array.from({length:12},()=>'<td>VeryLongDeviceSerialNumber12345678901234567890</td>').join('')}</tr></tbody></table></div>`);
    const geometry = await page.evaluate(()=>{
      const paper = document.querySelector('.kw-doc-paper');
      const table = document.querySelector('.kw-doc-table');
      const p = paper.getBoundingClientRect();
      const t = table.getBoundingClientRect();
      const style = getComputedStyle(paper);
      return {left:t.left-p.left-parseFloat(style.paddingLeft),right:p.right-parseFloat(style.paddingRight)-t.right,overflow:table.scrollWidth-table.clientWidth};
    });
    assert.ok(geometry.left>=-1 && geometry.right>=-1,JSON.stringify(geometry));
    assert.ok(geometry.overflow<=1,JSON.stringify(geometry));
  } finally { await browser.close(); }
});

test('journal lets administrators reconnect an unreadable Personal Drive secret', {skip: !chromePath}, async () => {
  const browser = await puppeteer.launch({executablePath:chromePath,headless:true,pipe:true,args:process.platform==='linux'?['--no-sandbox','--disable-dev-shm-usage']:[]});
  try {
    const page = await browser.newPage();
    await page.setContent('<body></body>');
    await page.evaluate(()=>{
      window.KudukJournalWorkspace = {workspaceId:()=> 'test-workspace'};
      window.savedDrive = false;
      window.testRole = 'administrator';
      window.fetch = async (url,options={}) => {
        let data;
        if (String(url).endsWith('/personal-drive')) {
          if (options.method==='PUT') window.savedDrive = true;
          data = {result:{appsScriptUrl:'https://script.google.com/macros/s/test/exec',ready:window.savedDrive,needsReconfiguration:!window.savedDrive}};
        } else data = {workspace:{memberRole:window.testRole,finalDocumentsFolderId:'test-folder'}};
        return new Response(JSON.stringify(data),{status:200});
      };
    });
    await page.addScriptTag({content:workflowSource});
    await page.evaluate(()=>window.KudukWorkflow.openFinalDocuments());
    await page.waitForFunction(()=>document.getElementById('kudukPersonalDriveStatus').textContent.includes('SEG_KIP_WEBHOOK_SECRET'));
    assert.equal(await page.$eval('#kudukPersonalDriveConfig',el=>el.hidden),false);
    assert.equal(await page.$eval('#kudukPersonalDriveSecret',el=>el.type),'password');
    await page.type('#kudukPersonalDriveSecret','test-secret-with-more-than-32-characters');
    await page.click('#kudukPersonalDriveSave');
    await page.waitForFunction(()=>document.getElementById('kudukPersonalDriveStatus').textContent.includes('Personal Drive ulangan'));
    assert.equal(await page.$eval('#kudukPersonalDriveSecret',el=>el.value),'');
    await page.evaluate(()=>{window.testRole='operator';window.KudukWorkflow.openFinalDocuments();});
    await page.waitForFunction(()=>document.getElementById('kudukPersonalDriveConfig').hidden);
  } finally { await browser.close(); }
});

test('JOURNAL UCHETA monthly reports are persisted separately from source Sheets rows', () => {
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS journal_reports/);
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS journal_report_batches/);
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS journal_report_items/);
  assert.match(migrationSource, /UNIQUE \(workspace_id, period_year, period_month\)/);
  assert.match(migrationSource, /UNIQUE \(report_id, source_key\)/);
});

test('journal places the active Uzbek KIP master PNG into rows and translates the signer interface', {skip:!chromePath}, async()=>{
  const browser=await puppeteer.launch({executablePath:chromePath,headless:true,pipe:true,args:process.platform==='linux'?['--no-sandbox','--disable-dev-shm-usage']:[]});
  try {
    const page=await browser.newPage();
    await page.setContent('<body></body>');
    await page.evaluate(()=>{
      const storage=new Map();
      Object.defineProperty(window,'localStorage',{value:{getItem:key=>storage.get(key)||'',setItem:(key,value)=>storage.set(key,value)}});
      window.KudukJournalWorkspace={workspaceId:()=> 'test-workspace'};
      window.signatureRequests=[];
      window.fetch=async url=>{
        if(String(url).includes('/signers/signature/')) {
          window.signatureRequests.push(String(url));
          const binary=atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=');
          return new Response(Uint8Array.from(binary,c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png'}});
        }
        let data;
        if(String(url).includes('/signers')) data={rows:[
          {id:'master',position:'НЎВваА устаси',fullName:'Test Master',status:'active',signatureFileId:'db:11111111-1111-4111-8111-111111111111'},
          {id:'inactive',position:'Мастер КИПиА',fullName:'Inactive Master',status:'inactive',signatureFileId:'db:22222222-2222-4222-8222-222222222222'},
          {id:'chief',position:'Начальник КИПиА',fullName:'Chief',status:'active',signatureFileId:'db:33333333-3333-4333-8333-333333333333'}
        ]};
        else if(String(url)==='/api/journal-reports') data={reports:[{year:2026,month:5,rowCount:1}]};
        else data={report:{year:2026,month:5},batches:[],items:[{executor:'Test Master',name:'Манометр'}]};
        return new Response(JSON.stringify(data),{status:200});
      };
    });
    await page.addScriptTag({content:workflowSource});
    await page.evaluate(()=>window.KudukWorkflow.openReports());
    await page.waitForSelector('#kudukOpenStoredDocument');
    await page.click('#kudukOpenStoredDocument');
    await page.waitForFunction(()=>document.querySelector('#kudukDocumentPaper td:last-child img')?.naturalWidth>0);
    assert.equal(await page.$eval('#kudukDocumentPaper td:last-child img',el=>el.title),'Test Master');
    const requests=await page.evaluate(()=>window.signatureRequests);
    assert.equal(requests.length,1);
    assert.match(requests[0],/11111111-1111-4111-8111-111111111111/);
    await page.click('#kudukDocumentClose');
    await page.evaluate(()=>window.KudukWorkflow.openSigners());
    await page.waitForFunction(()=>document.getElementById('kudukSignerRows').textContent.includes('Test Master'));
    await page.select('#kudukSignersLanguage','ru');
    assert.match(await page.$eval('#kudukSignerRows',el=>el.textContent),/Мастер КИПиА/);
    assert.equal(await page.$eval('#kudukSignerPosition',el=>el.placeholder),'Должность');
    await page.select('#kudukSignersLanguage','uz_cyrl');
    assert.match(await page.$eval('#kudukSignerRows',el=>el.textContent),/НЎВваА устаси/);
    assert.equal(await page.$eval('#kudukSignerPosition',el=>el.placeholder),'Лавозим');
  } finally {await browser.close();}
});

test('JOURNAL UCHETA mounts a workspace-protected report API', () => {
  assert.match(serverSource, /app\.use\("\/api\/journal-reports", journalReportsRouter\)/);
  assert.match(routeSource, /requireWorkspaceRequestPermission\('workspace:read'\)/);
  assert.match(routeSource, /requireWorkspaceRequestPermission\('documents:create'\)/);
  assert.match(routeSource, /router\.post\('\/:year\/:month\/append'/);
});

test('JOURNAL UCHETA document creation asks for a date inside the selected month', () => {
  assert.match(workflowSource, /id="kudukDocumentDate"/);
  assert.match(workflowSource, /type="date"/);
  assert.match(workflowSource, /openDocumentDateDialog/);
  assert.match(serviceSource, /JOURNAL_DOCUMENT_DATE_OUTSIDE_PERIOD/);
});

test('JOURNAL UCHETA appends selected rows and skips duplicates without changing source rows', () => {
  assert.match(workflowSource, /selectedMonthlyRows\(\)/);
  assert.match(workflowSource, /\/api\/journal-reports\/.*\/append/);
  assert.match(repositorySource, /ON CONFLICT \(report_id, source_key\) DO NOTHING/);
  assert.doesNotMatch(repositorySource, /UPDATE\s+.*(?:База|source_sheet)/i);
});

test('JOURNAL UCHETA Reports reads persisted monthly reports instead of reconstructing from live source rows', () => {
  assert.match(workflowSource, /api\('\/api\/journal-reports'\)/);
  assert.match(workflowSource, /api\('\/api\/journal-reports\/' \+ year \+ '\/' \+ month\)/);
  assert.match(workflowSource, /Ҳужжат санаси/);
});
