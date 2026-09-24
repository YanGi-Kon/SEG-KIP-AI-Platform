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
  assert.match(html, /faults-workflow\.js\?v=faults-workflow3-reglament-form/);
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

test('FAULTS monthly analysis creates a dedicated document blank', () => {
  assert.match(workflow, /Хужат яратиш/);
  assert.doesNotMatch(workflow, /Хужатни очиш/);
  assert.match(workflow, /id="faultsDocumentModal"/);
  assert.match(workflow, /function createMonthlyDocument\(\)/);
  assert.match(workflow, /function renderDocumentDraft\(\)/);
  assert.match(workflow, /template: 'faults-placeholder-v1'/);
  assert.match(workflow, /Vaqtinchalik blank/);
  assert.match(workflow, /ЖУРНАЛ НЕИСПРАВНОСТЕЙ/);
  assert.match(workflow, /faultsDocumentSave/);
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
