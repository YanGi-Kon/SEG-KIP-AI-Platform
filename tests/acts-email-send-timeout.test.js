import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const frontend = fs.readFileSync(new URL('../public/js/acts-workspace-documents.js', import.meta.url), 'utf8');
const approvalService = fs.readFileSync(new URL('../services/signatureApprovalService.js', import.meta.url), 'utf8');

test('document send allows the bounded Drive, Sheets and SMTP workflow to finish', () => {
  assert.match(frontend, /SEND_TIMEOUT_MS=120000/);
});

test('approval SMTP transport cannot wait indefinitely', () => {
  assert.match(approvalService, /connectionTimeout:\s*15000/);
  assert.match(approvalService, /greetingTimeout:\s*15000/);
  assert.match(approvalService, /socketTimeout:\s*20000/);
});
