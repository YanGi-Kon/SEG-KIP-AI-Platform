import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveWorkspaceGoogleConfig,
  testWorkspaceSheetConnection,
} from '../services/workspaceGoogleService.js';

function testServiceAccount() {
  return {
    type: 'service_account',
    project_id: 'test-project',
    client_email: 'test@example.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
  };
}

async function withGoogleEnv(callback) {
  const original = {
    json: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    base64: process.env.GOOGLE_SERVICE_ACCOUNT_BASE64,
    sheet: process.env.GOOGLE_SPREADSHEET_URL,
  };
  try {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    process.env.GOOGLE_SERVICE_ACCOUNT_BASE64 = Buffer.from(JSON.stringify(testServiceAccount())).toString('base64');
    process.env.GOOGLE_SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/LEGACY_GLOBAL_SHEET_ID_123456789/edit';
    return await callback();
  } finally {
    if (original.json === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    else process.env.GOOGLE_SERVICE_ACCOUNT_JSON = original.json;
    if (original.base64 === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;
    else process.env.GOOGLE_SERVICE_ACCOUNT_BASE64 = original.base64;
    if (original.sheet === undefined) delete process.env.GOOGLE_SPREADSHEET_URL;
    else process.env.GOOGLE_SPREADSHEET_URL = original.sheet;
  }
}

test('Workspace Google connector exports a callable connection check', () => {
  assert.equal(typeof testWorkspaceSheetConnection, 'function');
});

test('Workspace Sheet URL is not overridden by legacy global Sheet env', async () => {
  await withGoogleEnv(async () => {
    const workspaceSheet = 'https://docs.google.com/spreadsheets/d/WORKSPACE_SHEET_ID_123456789012345/edit';
    const config = await resolveWorkspaceGoogleConfig({
      spreadsheetUrl: workspaceSheet,
      mainSheetName: 'База',
    });
    assert.equal(config.spreadsheetUrl, workspaceSheet);
    assert.equal(config.serviceAccount.project_id, 'test-project');
  });
});

test('parallel Workspace configs keep their own Sheet URLs and do not mutate global env', async () => {
  await withGoogleEnv(async () => {
    const globalBefore = process.env.GOOGLE_SPREADSHEET_URL;
    const sheetA = 'https://docs.google.com/spreadsheets/d/WORKSPACE_A_SHEET_ID_123456789012345/edit';
    const sheetB = 'https://docs.google.com/spreadsheets/d/WORKSPACE_B_SHEET_ID_123456789012345/edit';
    const [configA, configB] = await Promise.all([
      resolveWorkspaceGoogleConfig({ spreadsheetUrl: sheetA, mainSheetName: 'База A' }),
      resolveWorkspaceGoogleConfig({ spreadsheetUrl: sheetB, mainSheetName: 'База B' }),
    ]);
    assert.equal(configA.spreadsheetUrl, sheetA);
    assert.equal(configB.spreadsheetUrl, sheetB);
    assert.notEqual(configA.spreadsheetUrl, configB.spreadsheetUrl);
    assert.equal(process.env.GOOGLE_SPREADSHEET_URL, globalBefore);
  });
});
