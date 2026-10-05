import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../public/js/kuduk-workflow.js', import.meta.url), 'utf8');

test('monthly journal shows three row lifecycle states', () => {
  assert.match(workflow, /kw-row-unselected/);
  assert.match(workflow, /kw-row-selected/);
  assert.match(workflow, /kw-row-reported/);
  assert.match(workflow, /✓ Ҳисоботда/);
});

test('already reported rows cannot be selected again', () => {
  assert.match(workflow, /isReportedRow\(row,index\)/);
  assert.match(workflow, /if \(!isReportedRow\(row,index\)\) monthlyState\.selectedKeys\.add/);
  assert.match(workflow, /master\.disabled = !selectable\.length/);
});

test('monthly analytics expose totals reported remaining selected batches and progress', () => {
  for (const id of [
    'kudukKpiTotal',
    'kudukKpiReported',
    'kudukKpiRemaining',
    'kudukKpiSelected',
    'kudukKpiBatches',
    'kudukKpiProgress',
    'kudukProgressBar',
  ]) assert.match(workflow, new RegExp(id));
});

test('report state is loaded from persistent monthly report API', () => {
  assert.match(workflow, /\/api\/journal-reports\/.*monthlyState\.year.*monthlyState\.month/);
  assert.match(workflow, /monthlyState\.reportedKeys/);
});
