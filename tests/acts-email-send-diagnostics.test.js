import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../public/js/acts-workspace-documents.js', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../public/js/fix.js', import.meta.url), 'utf8');

test('document send preserves structured backend email diagnostics', () => {
  assert.match(source, /error\.data=d/);
  assert.match(source, /error\.code=d\.code/);
  assert.match(source, /String\(detail\.code\|\|''\)\.startsWith\('EMAIL_'\)/);
  assert.match(source, /showEmailDiagnostics\(detail\)/);
});

test('top-level SMTP failure renders cause, response code and recommended fix', () => {
  assert.match(source, /result\?\.error\?result:null/);
  assert.match(source, /first\.responseCode/);
  assert.match(source, /recommendedFix\(result,first\)/);
  assert.match(source, /Email login yoki yuborish kaliti provider tomonidan rad etildi/);
});

test('document-send frontend cache version is bumped', () => {
  assert.match(loader, /acts-workspace-documents\.js\?v=stage8f/);
});
