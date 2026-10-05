import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const workflowSource = fs.readFileSync(new URL('../public/js/kuduk-workflow.js', import.meta.url), 'utf8');
const migrationSource = fs.readFileSync(new URL('../db/migrations/033_journal_reports.sql', import.meta.url), 'utf8');
const routeSource = fs.readFileSync(new URL('../routes/journalReports.js', import.meta.url), 'utf8');
const serviceSource = fs.readFileSync(new URL('../services/journalReportService.js', import.meta.url), 'utf8');
const repositorySource = fs.readFileSync(new URL('../repositories/journalReportRepository.js', import.meta.url), 'utf8');

test('JOURNAL UCHETA monthly reports are persisted separately from source Sheets rows', () => {
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS journal_reports/);
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS journal_report_batches/);
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS journal_report_items/);
  assert.match(migrationSource, /UNIQUE \(workspace_id, period_year, period_month\)/);
  assert.match(migrationSource, /UNIQUE \(report_id, source_key\)/);
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
