import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedDriveServiceAccountProvider } from '../services/driveProviders/sharedDriveServiceAccountProvider.js';
import { isRetryableFinalPdfError } from '../services/finalPdfExportWorker.js';

function providerWithFolder(folder) {
  const calls = { created: 0, deleted: 0 };
  const drive = {
    files: {
      get: async () => ({ data: folder }),
      create: async () => {
        calls.created += 1;
        return { data: { id: 'test-file-id' } };
      },
      delete: async () => { calls.deleted += 1; },
    },
  };
  return {
    calls,
    provider: new SharedDriveServiceAccountProvider({
      drive,
      serviceAccount: {
        client_email: 'service@example.iam.gserviceaccount.com',
        project_id: 'seg-kip-test',
      },
    }),
  };
}

test('Shared Drive folder validation succeeds and cleans up the write test', async () => {
  const { provider, calls } = providerWithFolder({
    id: 'folder-id',
    name: 'Final documents',
    mimeType: 'application/vnd.google-apps.folder',
    driveId: 'shared-drive-id',
    capabilities: { canAddChildren: true, canEdit: true },
  });
  const result = await provider.validateFolder('folder-id', { writeTest: true });
  assert.equal(result.ok, true);
  assert.equal(result.driveId, 'shared-drive-id');
  assert.equal(result.provider, 'shared_drive_service_account');
  assert.equal(calls.created, 1);
  assert.equal(calls.deleted, 1);
});

test('Ordinary My Drive folder is rejected with a stable permanent error', async () => {
  const { provider, calls } = providerWithFolder({
    id: 'folder-id',
    name: 'My Drive folder',
    mimeType: 'application/vnd.google-apps.folder',
    driveId: '',
    capabilities: { canAddChildren: true, canEdit: true },
  });
  await assert.rejects(
    provider.validateFolder('folder-id'),
    (error) => error.code === 'DRIVE_SHARED_DRIVE_REQUIRED',
  );
  assert.equal(calls.created, 0);
  assert.equal(isRetryableFinalPdfError({ code: 'DRIVE_SHARED_DRIVE_REQUIRED' }), false);
});

test('Transient upload failure remains retryable', () => {
  assert.equal(isRetryableFinalPdfError({ code: 'DRIVE_UPLOAD_FAILED' }), true);
});
