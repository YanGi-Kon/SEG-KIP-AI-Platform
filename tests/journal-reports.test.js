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
    const documentStyle = workflowSource.split('\n').find(line=>line.includes('.kw-doc-paper{'));
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
        else data={report:{year:2026,month:5},batches:[],items:[{executor:'',name:'Манометр'}]};
        return new Response(JSON.stringify(data),{status:200});
      };
    });
    await page.addScriptTag({content:workflowSource});
    await page.evaluate(()=>window.KudukWorkflow.openReports());
    await page.waitForSelector('#kudukOpenStoredDocument');
    const reportsLayout=await page.evaluate(()=>{
      const reports=document.getElementById('kudukReportsModal');
      const shell=reports.querySelector('.kw-shell');
      return {position:getComputedStyle(reports).position,width:shell.getBoundingClientRect().width,viewport:innerWidth,height:shell.getBoundingClientRect().height,viewportHeight:innerHeight};
    });
    assert.equal(reportsLayout.position,'relative');
    assert.ok(reportsLayout.width>=reportsLayout.viewport-26,JSON.stringify(reportsLayout));
    assert.ok(reportsLayout.height>=reportsLayout.viewportHeight-26,JSON.stringify(reportsLayout));
    await page.click('#kudukOpenStoredDocument');
    await page.waitForFunction(()=>document.querySelector('#kudukDocumentPaper td:last-child img')?.naturalWidth>0);
    const documentLayout=await page.evaluate(()=>{
      const rect=document.querySelector('#kudukDocumentModal>.kw-shell').getBoundingClientRect();
      return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,viewportWidth:innerWidth,viewportHeight:innerHeight,reportsHidden:getComputedStyle(document.getElementById('kudukReportsModal')).display==='none'};
    });
    assert.equal(documentLayout.x,0);
    assert.equal(documentLayout.y,0);
    assert.equal(documentLayout.width,documentLayout.viewportWidth);
    assert.equal(documentLayout.height,documentLayout.viewportHeight);
    assert.equal(documentLayout.reportsHidden,true);
    assert.equal(await page.$eval('#kudukDocumentPaper td:last-child img',el=>el.title),'Test Master');
    assert.equal(await page.$eval('#kudukDocumentPaper td:nth-last-child(2)',el=>el.textContent),'Test Master');
    const requests=await page.evaluate(()=>window.signatureRequests);
    assert.equal(requests.length,1);
    assert.match(requests[0],/11111111-1111-4111-8111-111111111111/);
    await page.click('#kudukDocumentClose');
    assert.equal(await page.evaluate(()=>document.body.classList.contains('kuduk-document-home')),false);
    assert.equal(await page.$eval('#kudukReportsModal',el=>getComputedStyle(el).display),'flex');
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

test('reports fill the parent main area and restore its layout on return', {skip:!chromePath}, async()=>{
  const browser=await puppeteer.launch({executablePath:chromePath,headless:true,pipe:true,args:process.platform==='linux'?['--no-sandbox']:[]});
  try {
    const page=await browser.newPage();
    await page.setViewport({width:1600,height:1000});
    const css=fs.readFileSync(new URL('../public/css/style.css',import.meta.url),'utf8');
    await page.setContent(`<style>${css}</style><div class="app"><aside class="sidebar"></aside><main class="main"><header class="topbar">Header</header><section class="generic-module-page active"><iframe id="hisobotModuleFrame"></iframe></section></main></div>`);
    const frame=await (await page.$('iframe')).contentFrame();
    await frame.setContent('<style>*{box-sizing:border-box}body{margin:0}</style><body></body>');
    await frame.evaluate(()=>{window.fetch=async()=>new Response(JSON.stringify({reports:[]}));});
    await frame.addScriptTag({content:workflowSource});
    await frame.evaluate(()=>window.KudukWorkflow.openReports());
    for (const height of [1000,700]) {
      await page.setViewport({width:1600,height});
      const bounds=await page.evaluate(()=>{
        const rect=document.querySelector('iframe').getBoundingClientRect();
        const sidebar=document.querySelector('.sidebar').getBoundingClientRect();
        return {x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom,sidebarRight:sidebar.right,width:innerWidth,height:innerHeight};
      });
      assert.equal(bounds.x,bounds.sidebarRight,JSON.stringify(bounds));
      assert.equal(bounds.y,0,JSON.stringify(bounds));
      assert.equal(bounds.right,bounds.width,JSON.stringify(bounds));
      assert.equal(bounds.bottom,bounds.height,JSON.stringify(bounds));
    }
    await frame.click('#kudukReportsClose');
    assert.equal(await page.$eval('iframe',el=>el.hasAttribute('data-kuduk-full-page')),false);
    assert.notEqual(await page.$eval('.topbar',el=>getComputedStyle(el).display),'none');
  } finally {await browser.close();}
});
