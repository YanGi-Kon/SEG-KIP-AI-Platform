import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const bridgeFile = new URL('../services/workspaceApprovalBridgeService.js', import.meta.url);
const publicServiceFile = new URL('../services/workspaceApprovalPublicService.js', import.meta.url);
const signatureRoutesFile = new URL('../routes/signatures.js', import.meta.url);
const legacyActsFile = new URL('../routes/acts.js', import.meta.url);

test('workspace approval bridge never mutates global Google Sheet env', async () => {
  const source = await fs.readFile(bridgeFile, 'utf8');
  assert.equal(source.includes('process.env.GOOGLE_SPREADSHEET_URL ='), false);
  assert.equal(source.includes('pinLegacyApprovalToWorkspace'), false);
  assert.match(source, /workspaceId:\s*workspace\.id/);
  assert.match(source, /resolveWorkspaceGoogleConfig\(workspace\)/);
});

test('workspace approval public service resolves config from token workspaceId', async () => {
  const source = await fs.readFile(publicServiceFile, 'utf8');
  assert.match(source, /payload\.workspaceId/);
  assert.match(source, /findWorkspaceForSignedLink/);
  assert.match(source, /resolveWorkspaceGoogleConfig\(workspace\)/);
});

test('approval routes dispatch workspace tokens without exposing private credentials', async () => {
  const source = await fs.readFile(signatureRoutesFile, 'utf8');
  assert.match(source, /isWorkspaceApprovalToken/);
  assert.match(source, /openWorkspaceApproval/);
  assert.match(source, /approveWorkspaceDocument/);
  assert.equal(source.includes('private_key'), false);
});

test('legacy Acts API is unavailable when workspace mode is enabled', async () => {
  const source = await fs.readFile(legacyActsFile, 'utf8');
  assert.match(source, /LEGACY_ACTS_API_DISABLED/);
  assert.match(source, /WORKSPACE_MODE_ENABLED/);
});
