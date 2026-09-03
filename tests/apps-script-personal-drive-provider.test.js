import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {
  AppsScriptPersonalDriveProvider,
  canonicalJson,
  signAppsScriptRequest,
} from '../services/driveProviders/appsScriptPersonalDriveProvider.js';
import { isRetryableFinalPdfError } from '../services/finalPdfExportWorker.js';
import { classifyWorkspaceDriveError } from '../services/workspaceDriveFolderService.js';

test('canonical JSON is stable regardless of object key insertion order', () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: 2, x: 3 } }),
    canonicalJson({ a: { x: 3, y: 2 }, z: 1 }),
  );
});
test('request signature matches a standard SHA-256 HMAC', () => {
  const envelope = { action: 'validate_folder', payload: { folderId: 'abc' }, timestamp: 123, nonce: 'n-1' };
  const expected = crypto.createHmac('sha256', 'secret').update(canonicalJson(envelope), 'utf8').digest('hex');
  assert.equal(signAppsScriptRequest(envelope, 'secret'), expected);
});

test('request signature uses UTF-8 for Cyrillic PDF content', () => {
  const envelope = {
    action: 'upload_pdf_base64',
    payload: {
      targetFolderId: 'target-1',
      name: 'АКТ_2026_0019 - Tasdiqlangan.pdf',
      mimeType: 'application/pdf',
      pdfBase64: Buffer.from('%PDF-test', 'ascii').toString('base64'),
    },
    timestamp: 1785684540000,
    nonce: 'unicode-test-1',
  };
  const expected = crypto
    .createHmac('sha256', Buffer.from('test-secret', 'utf8'))
    .update(Buffer.from(canonicalJson(envelope), 'utf8'))
    .digest('hex');
  assert.equal(signAppsScriptRequest(envelope, 'test-secret'), expected);
});

test('Apps Script verifies webhook HMAC with explicit UTF-8', async () => {
  const source = await fs.readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
  assert.match(
    source,
    /computeHmacSha256Signature\([\s\S]*Utilities\.Charset\.UTF_8[\s\S]*\)/,
  );
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

test('workspace secret configuration failures are permanent', () => {
  assert.equal(isRetryableFinalPdfError({ code: 'WORKSPACE_ENCRYPTION_KEY_REQUIRED' }), false);
  assert.equal(isRetryableFinalPdfError({ code: 'WORKSPACE_SECRET_INVALID' }), false);
  assert.equal(isRetryableFinalPdfError({ code: 'WORKSPACE_SECRET_DECRYPT_FAILED' }), false);
});

test('workspace secret errors remain actionable instead of becoming Shared Drive errors', () => {
  const error = Object.assign(new Error('Workspace secretni ochib bo‘lmadi.'), {
    code: 'WORKSPACE_SECRET_DECRYPT_FAILED',
    statusCode: 500,
  });
  const classified = classifyWorkspaceDriveError(error);
  assert.equal(classified.code, 'WORKSPACE_SECRET_DECRYPT_FAILED');
  assert.match(classified.recommendedFix, /qayta ulang/i);
});

test('HTML 404 from an expired Apps Script deployment is actionable and permanent', async () => {
  const provider = new AppsScriptPersonalDriveProvider({
    url: 'https://script.google.com/macros/s/expired/exec',
    secret: 'secret',
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      headers: { get: () => 'text/html; charset=utf-8' },
      text: async () => '<!doctype html><title>Not Found</title>',
    }),
  });
  await assert.rejects(provider.validateFolder('folder'), (error) => {
    assert.equal(error.code, 'DRIVE_APPS_SCRIPT_DEPLOYMENT_NOT_FOUND');
    assert.match(error.recommendedFix, /Manage deployments/i);
    assert.equal(isRetryableFinalPdfError(error), false);
    return true;
  });
});

test('Apps Script PDF response must contain a real Drive file ID', async () => {
  const provider = new AppsScriptPersonalDriveProvider({
    url: 'https://script.google.com/macros/s/deployment/exec',
    secret: 'secret',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, url: '' }),
    }),
  });
  await assert.rejects(
    provider.uploadPdf('target', 'a.pdf', Buffer.from('%PDF-test', 'ascii')),
    (error) => error.code === 'DRIVE_UPLOAD_RESULT_INVALID',
  );
});

test('Personal Drive provider sends PDF bytes as authenticated Base64', async () => {
  let request = null;
  const pdf = Buffer.from('%PDF-ready-pdf-bytes', 'ascii');
  const provider = new AppsScriptPersonalDriveProvider({
    url: 'https://script.google.com/macros/s/deployment/exec',
    secret: 'secret',
    fetchImpl: async (url, options) => {
      request = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          ok: true,
          fileId: 'drive-file-1',
          url: 'https://drive.google.com/file/d/drive-file-1/view',
          size: pdf.length,
          parentFolderId: 'documents-folder-1',
          createdAt: '2026-09-03T12:00:00.000Z',
        }),
      };
    },
  });

  const uploaded = await provider.uploadPdf('documents-folder-1', 'AKT-1 - Tasdiqlangan.pdf', pdf);
  assert.equal(request.action, 'upload_pdf_base64');
  assert.equal(request.payload.mimeType, 'application/pdf');
  assert.equal(Buffer.from(request.payload.pdfBase64, 'base64').toString('ascii'), pdf.toString('ascii'));
  assert.equal(uploaded.fileId, 'drive-file-1');
  assert.equal(uploaded.size, pdf.length);
  assert.equal(uploaded.parentFolderId, 'documents-folder-1');
});

test('Personal Drive provider rejects empty or non-PDF bytes before upload', async () => {
  const provider = new AppsScriptPersonalDriveProvider({
    url: 'https://example.test/exec',
    secret: 'secret',
    fetchImpl: async () => { throw new Error('fetch must not be called'); },
  });
  await assert.rejects(provider.uploadPdf('folder', 'empty.pdf', Buffer.alloc(0)), { code: 'DRIVE_PDF_BYTES_EMPTY' });
  await assert.rejects(provider.uploadPdf('folder', 'fake.pdf', Buffer.from('not-pdf')), { code: 'DRIVE_PDF_SIGNATURE_INVALID' });
});
