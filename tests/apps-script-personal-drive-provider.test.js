import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  AppsScriptPersonalDriveProvider,
  canonicalJson,
  signAppsScriptRequest,
} from '../services/driveProviders/appsScriptPersonalDriveProvider.js';
import { isRetryableFinalPdfError } from '../services/finalPdfExportWorker.js';

test('canonical JSON is stable regardless of object key insertion order', () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: 2, x: 3 } }),
    canonicalJson({ a: { x: 3, y: 2 }, z: 1 }),
  );
});
test('request signature matches a standard SHA-256 HMAC', () => {
  const envelope = { action: 'validate_folder', payload: { folderId: 'abc' }, timestamp: 123, nonce: 'n-1' };
  const expected = crypto.createHmac('sha256', 'secret').update(canonicalJson(envelope)).digest('hex');
  assert.equal(signAppsScriptRequest(envelope, 'secret'), expected);
});

test('Personal Drive provider signs requests and maps folder diagnostics', async () => {
  let request = null;
  const fetchImpl = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: true,
        folderId: 'folder-1',
        folderName: 'KIP',
        folderUrl: 'https://drive.google.com/drive/folders/folder-1',
        writeTestPassed: true,
      }),
    };
  };
  const provider = new AppsScriptPersonalDriveProvider({
    url: 'https://script.google.com/macros/s/deployment/exec',
    secret: 'test-secret',
    fetchImpl,
  });
  const result = await provider.validateFolder('folder-1');
  assert.equal(result.provider, 'apps_script_personal_drive');
  assert.equal(result.writeTestPassed, true);
  assert.equal(request.body.action, 'validate_folder');
  assert.equal(request.body.payload.folderId, 'folder-1');
  assert.equal(
    request.body.signature,
    signAppsScriptRequest({
      action: request.body.action,
      payload: request.body.payload,
      timestamp: request.body.timestamp,
      nonce: request.body.nonce,
    }, 'test-secret'),
  );
});

test('Apps Script auth failure is permanent but a remote 5xx is retryable', async () => {
  const authProvider = new AppsScriptPersonalDriveProvider({
    url: 'https://example.test/exec',
    secret: 'secret',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: false, code: 'DRIVE_APPS_SCRIPT_AUTH_FAILED', error: 'denied', statusCode: 403 }),
    }),
  });
  await assert.rejects(authProvider.validateFolder('folder'), (error) => {
    assert.equal(error.code, 'DRIVE_APPS_SCRIPT_AUTH_FAILED');
    assert.equal(isRetryableFinalPdfError(error), false);
    return true;
  });

  const serverProvider = new AppsScriptPersonalDriveProvider({
    url: 'https://example.test/exec',
    secret: 'secret',
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => '' }),
  });
  await assert.rejects(serverProvider.validateFolder('folder'), (error) => {
    assert.equal(error.code, 'DRIVE_UPLOAD_FAILED');
    assert.equal(isRetryableFinalPdfError(error), true);
    return true;
  });
});
