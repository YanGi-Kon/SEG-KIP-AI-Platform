import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveWorkspaceGoogleConfig,
  testWorkspaceSheetConnection,
} from '../services/workspaceGoogleService.js';

test('Workspace Google connector exports a callable connection check', () => {
  assert.equal(typeof testWorkspaceSheetConnection, 'function');
});

test('Workspace Sheet URL is not overridden by legacy global Sheet env', () => {
  const original = {
    json: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    base64: process.env.GOOGLE_SERVICE_ACCOUNT_BASE64,
    sheet: process.env.GOOGLE_SPREADSHEET_URL,
  };

  try {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    process.env.GOOGLE_SERVICE_ACCOUNT_BASE64 = Buffer.from(JSON.stringify({
      type: 'service_account',
      project_id: 'test-project',
      client_email: 'test@example.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
    })).toString('base64');
    process.env.GOOGLE_SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/LEGACY_GLOBAL_SHEET_ID_123456789/edit';

    const workspaceSheet = 'https://docs.google.com/spreadsheets/d/WORKSPACE_SHEET_ID_123456789012345/edit';
    const config = resolveWorkspaceGoogleConfig({
      spreadsheetUrl: workspaceSheet,
      mainSheetName: 'База',
    });

    assert.equal(config.spreadsheetUrl, workspaceSheet);
    assert.equal(config.serviceAccount.project_id, 'test-project');
  } finally {
    if (original.json === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    else process.env.GOOGLE_SERVICE_ACCOUNT_JSON = original.json;
    if (original.base64 === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;
    else process.env.GOOGLE_SERVICE_ACCOUNT_BASE64 = original.base64;
    if (original.sheet === undefined) delete process.env.GOOGLE_SPREADSHEET_URL;
    else process.env.GOOGLE_SPREADSHEET_URL = original.sheet;
  }
});
