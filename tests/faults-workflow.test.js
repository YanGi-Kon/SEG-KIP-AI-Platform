import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/modules/faults.html', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../public/js/faults-workflow.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../db/migrations/032_fault_reports.sql', import.meta.url), 'utf8');
const repository = fs.readFileSync(new URL('../repositories/faultReportRepository.js', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../services/faultReportService.js', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../routes/faults.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const migrate = fs.readFileSync(new URL('../db/migrate.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');

test('FAULTS toolbar mirrors TO workflow sections', () => {
  for (const id of [
    'faultsMonthlyAnalysisBtn',
    'faultsReportsBtn',
    'faultsSignersBtn',
    'faultsFinalDocumentsBtn',
    'faultsSettingsBtn',
    'faultsSaveReportBtn',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /1\. Ойлик анализ/);
  assert.match(html, /3\. Хисоботлар/);
  assert.match(html, /5\. ИМЗО ЧЕКУВЧИЛАР/);
  assert.match(html, /6\. ЯКУНИЙ ҲУЖЖАТЛАР/);
  assert.match(html, /⚙ Созламалар/);
  assert.match(html, /faults-workflow\.js\?v=faults-workflow6-analysis-home/);
});

test('FAULTS workflow script is syntactically valid and exposes all panels', () => {
  assert.doesNotThrow(() => new Function(workflow));
  for (const id of [
    'faultsMonthlyModal',
    'faultsReportsModal',
    'faultsSignersModal',
    'faultsFinalModal',
    'faultsSettingsModal',
  ]) {
    assert.match(workflow, new RegExp(id));
  }
  assert.match(workflow, /window\.FaultsWorkflow/);
});

test('FAULTS opens monthly analysis automatically on every module entry', () => {
  assert.match(workflow, /function autoOpenMonthlyAnalysis\(\)/);
  assert.match(workflow, /window\.setTimeout\(autoOpenMonthlyAnalysis, 120\)/);
  assert.match(workflow, /event\.data\?\.type === 'SEG_KIP_FAULTS_OPEN'/);
  assert.match(workflow, /window\.setTimeout\(autoOpenMonthlyAnalysis, 0\)/);
  assert.match(app, /postMessage\(\{ type: 'SEG_KIP_FAULTS_OPEN' \}, '\*'\)/);
  assert.match(app, /const isFaults = moduleName === 'faults'/);
  assert.match(app, /faults: 'modules\/faults\.html\?v=20260925-analysis-home1'/);
});

test('FAULTS main workspace shows only monthly analysis while legacy journal stays hidden', () => {
  assert.match(workflow, /body\.faults-analysis-home \.faults-wrap\{display:none!important\}/);
  assert.match(workflow, /body\.faults-analysis-home #faultsMonthlyModal\{position:relative/);
  assert.match(workflow, /document\.body\.classList\.add\('faults-analysis-home'\)/);
  assert.match(workflow, /id="faultsHomeReports"/);
  assert.match(workflow, /id="faultsHomeSigners"/);
  assert.match(workflow, /id="faultsHomeFinal"/);
  assert.match(workflow, /id="faultsHomeSettings"/);
  assert.match(workflow, /modal\.id === 'faultsMonthlyModal'/);
  assert.doesNotMatch(workflow, /\$\('faultsMonthlyModal'\)\?\.classList\.remove\('show'\);\s*\$\('faultsDocumentModal'\)/);
});

test('FAULTS monthly analysis creates a dedicated document blank', () => {
  assert.match(workflow, /Хужат яратиш/);
  assert.doesNotMatch(workflow, /Хужатни очиш/);
  assert.match(workflow, /id="faultsDocumentModal"/);
  assert.match(workflow, /function createMonthlyDocument\(\)/);
  assert.match(workflow, /function renderDocumentDraft\(\)/);
  assert.match(workflow, /template: 'reglament-appendix-3-v1'/);
  assert.match(workflow, /Приложение № 3 к/);
  assert.match(workflow, /Регламенту/);
  assert.match(workflow, /ФОРМА/);
  assert.match(workflow, /Журнал учета отказов и неисправностей оборудования автоматики/);
  assert.match(workflow, /КИПиА ЦДНГ №… ТПП «,,,»/);
  assert.match(workflow, /faultsDocumentSave/);
});

test('FAULTS official blank preserves existing ACT number transfer logic', () => {
  assert.match(workflow, /<td>\$\{hasData \? esc\(row\.actNo\) : ''\}<\/td>/);
  assert.match(service, /<td>\$\{hasData \? esc\(row\.actNo\) : ''\}<\/td>/);
  assert.doesNotMatch(workflow, /<td>\$\{hasData \? index \+ 1 : ''\}<\/td>/);
  assert.doesNotMatch(service, /<td>\$\{hasData \? index \+ 1 : ''\}<\/td>/);
});

test('FAULTS official blank preserves Appendix 3 A4 landscape geometry', () => {
  assert.match(workflow, /width:297mm/);
  assert.match(workflow, /min-height:210mm/);
  assert.match(workflow, /padding:13\.79mm 10\.94mm 8\.10mm 4\.94mm/);
  for (const width of ['6.17%', '10.71%', '9.56%', '31.26%', '21.52%', '9.38%', '11.42%']) {
    assert.match(workflow, new RegExp(width.replace('.', '\\.')));
    assert.match(service, new RegExp(width.replace('.', '\\.')));
  }
  assert.match(workflow, /while \(rows\.length < 15\) rows\.push\(\{\}\)/);
  assert.match(service, /for \(let index = 0; index < sourceRows\.length; index \+= 15\)/);
  assert.match(service, /@page\{size:A4 landscape;margin:0\}/);
  assert.match(service, /font-family:"Times New Roman",Times,serif/);
});

test('database migration CLI loads local .env before reading DATABASE_URL', () => {
  assert.match(migrate, /^import 'dotenv\/config';/);
});

test('FAULTS API explains when the new report table migration is missing', () => {
  assert.match(route, /FAULT_REPORTS_MIGRATION_REQUIRED/);
  assert.match(route, /fault_reports jadvali hali yaratilmagan/);
  assert.match(route, /npm run db:migrate/);
  assert.match(server, /DB_AUTO_MIGRATE=false/);
  assert.match(server, /Run: npm run db:migrate/);
});

test('FAULTS reports persist one monthly snapshot per workspace', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS fault_reports/);
  assert.match(migration, /UNIQUE \(workspace_id, period_year, period_month\)/);
  assert.match(migration, /rows_snapshot jsonb/);
  assert.match(migration, /signer_snapshot jsonb/);
  assert.match(migration, /final_pdf jsonb/);
  assert.match(repository, /ON CONFLICT \(workspace_id, period_year, period_month\)/);
  assert.match(route, /router\.post\('\/reports\/:year\/:month'/);
  assert.match(route, /router\.get\('\/reports'/);
  assert.match(route, /router\.delete\('\/reports\/:year\/:month'/);
  assert.match(server, /app\.use\("\/api\/faults", faultsRouter\)/);
});

test('FAULTS generated document Save persists the document snapshot to 3. Хисоботлар', () => {
  assert.match(workflow, /faultsDocumentSave/);
  assert.match(workflow, /addEventListener\('click', \(\) => void saveDocumentDraft\(\)\)/);
  assert.match(workflow, /async function saveDocumentDraft\(\)/);
  assert.match(workflow, /const draft = uiState\.documentDraft/);
  assert.match(workflow, /\/api\/faults\/reports\/\$\{draft\.year\}\/\$\{draft\.month\}/);
  assert.match(workflow, /rows,/);
  assert.match(workflow, /signer: draft\.signer \|\| currentSignerSnapshot\(\)/);
  assert.match(workflow, /3\. Хисоботлар га сақланди/);
  assert.match(workflow, /savedReportId/);
});

test('FAULTS save captures editable journal fields into reports', () => {
  assert.match(workflow, /faults-action-text/);
  assert.match(workflow, /faults-resolution-date/);
  assert.match(workflow, /function normalizeCurrentRow/);
  assert.match(workflow, /saveCurrentReport/);
  assert.match(workflow, /\/api\/faults\/reports\/\$\{year\}\/\$\{month\}/);
  assert.match(service, /actionText: clean\(row\.actionText\)/);
  assert.match(service, /actionDate: clean\(row\.actionDate\)/);
  assert.match(service, /actionTime: clean\(row\.actionTime\)/);
});

test('FAULTS reports panel supports draft edit delete and completed PDF link', () => {
  assert.match(workflow, /3\. Хисоботлар/);
  assert.match(workflow, /Tahrirlash/);
  assert.match(workflow, /O‘chirish/);
  assert.match(workflow, /Yakuniy A4 PDF Drive'da/);
  assert.match(workflow, /editSavedReport/);
  assert.match(workflow, /deleteSavedReport/);
});

test('FAULTS signer panel uses shared Workspace signer registry', () => {
  assert.match(workflow, /5\. ИМЗО ЧЕКУВЧИЛАР/);
  assert.match(workflow, /\/signers\?includeInactive=true/);
  assert.match(workflow, /\/signers\/signature/);
  assert.match(workflow, /method: 'POST'/);
  assert.match(html, /responsibleSigner/);
});

test('FAULTS final documents use Workspace Drive folder and export A4 PDF', () => {
  assert.match(workflow, /6\. ЯКУНИЙ ҲУЖЖАТЛАР/);
  assert.match(workflow, /documents\/final-folder/);
  assert.match(workflow, /documents\/final-folder\/test/);
  assert.match(workflow, /\/finalize/);
  assert.match(route, /router\.post\('\/reports\/:year\/:month\/finalize'/);
  assert.match(service, /ensureWorkspaceDocumentsSubfolder/);
  assert.match(service, /folderName: 'ХУЖАТЛАР'/);
  assert.match(service, /renderHtmlToA4Pdf\(html, \{ allowMultiPage: true \}\)/);
  assert.match(service, /provider\.uploadPdf/);
  assert.match(service, /NOSOZLIKLAR_JURNALI_/);
});

test('FAULTS settings store an independent source sheet key', () => {
  assert.match(html, /MODULE_SHEET_KEY='faults_sheet_name'/);
  assert.match(html, /moduleSettings\?\.\[MODULE_SHEET_KEY\]/);
  assert.match(workflow, /const MODULE_SHEET_KEY = 'faults_sheet_name'/);
  assert.match(workflow, /SAVE_MODULE_SETTINGS/);
  assert.match(workflow, /\/api\/acts\/settings\/test/);
});
