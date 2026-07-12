import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptWorkspaceJsonSecret,
  encryptWorkspaceJsonSecret,
} from '../services/workspaceSecretService.js';
import { getServiceAccountPublicInfo } from '../services/googleCredentialService.js';

const serviceAccount = {
  type: 'service_account',
  project_id: 'workspace-project',
  client_email: 'workspace@example.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
};

function withEncryptionKey(value, callback) {
  const previous = process.env.WORKSPACE_ENCRYPTION_KEY;
  process.env.WORKSPACE_ENCRYPTION_KEY = value;
  try {
    return callback();
  } finally {
    if (previous === undefined) delete process.env.WORKSPACE_ENCRYPTION_KEY;
    else process.env.WORKSPACE_ENCRYPTION_KEY = previous;
  }
}

test('workspace JSON encrypts and decrypts with the same key', () => {
  withEncryptionKey('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', () => {
    const encrypted = encryptWorkspaceJsonSecret(serviceAccount);
    assert.match(encrypted, /^v1:/);
    assert.notEqual(encrypted.includes(serviceAccount.private_key), true);
    assert.deepEqual(decryptWorkspaceJsonSecret(encrypted), serviceAccount);
  });
});

test('workspace JSON cannot be decrypted with a different key', () => {
  let encrypted;
  withEncryptionKey('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', () => {
    encrypted = encryptWorkspaceJsonSecret(serviceAccount);
  });
  withEncryptionKey('abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789', () => {
    assert.throws(
      () => decryptWorkspaceJsonSecret(encrypted),
      (error) => error?.code === 'WORKSPACE_SECRET_DECRYPT_FAILED',
    );
  });
});

test('public service account info never includes private_key', () => {
  const publicInfo = getServiceAccountPublicInfo(serviceAccount, 'WORKSPACE_SERVICE_ACCOUNT');
  assert.equal(publicInfo.clientEmail, serviceAccount.client_email);
  assert.equal(publicInfo.projectId, serviceAccount.project_id);
  assert.equal(Object.hasOwn(publicInfo, 'private_key'), false);
});
