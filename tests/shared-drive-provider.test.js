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

test('replacing a same-name PDF updates the current-month file and removes same-name duplicates', async () => {
  const calls = [];
  const files = [
    { id:'old-current', mimeType:'application/pdf', parents:['folder-id'] },
    { id:'old-duplicate', mimeType:'application/pdf', parents:['folder-id'] },
  ];
  const provider = new SharedDriveServiceAccountProvider({
    drive:{files:{
      list:async(options)=>{calls.push({type:'list',options});return{data:{files}};},
      update:async(options)=>{calls.push({type:'update',options});return{data:{id:options.fileId,size:9,parents:['folder-id'],webViewLink:'https://drive.google.com/file/d/old-current/view'}};},
      delete:async(options)=>{calls.push({type:'delete',options});},
    }},
  });
  const result = await provider.replacePdf('folder-id','ЖУРНАЛ - 2026-10.pdf',Buffer.from('%PDF-test'));
  assert.equal(result.fileId,'old-current');
  assert.equal(result.replaced,true);
  assert.equal(result.removedDuplicates,1);
  assert.equal(calls.find(call=>call.type==='list').options.q.includes("name='ЖУРНАЛ - 2026-10.pdf'"),true);
  assert.equal(calls.find(call=>call.type==='update').options.fileId,'old-current');
  assert.deepEqual(calls.filter(call=>call.type==='delete').map(call=>call.options.fileId),['old-duplicate']);
});
