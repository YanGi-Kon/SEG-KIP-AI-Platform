import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptWorkspaceSecret,
  encryptWorkspaceSecret,
  validateAppsScriptDeploymentUrl,
} from '../services/workspaceSecretService.js';

const env = { WORKSPACE_ENCRYPTION_KEY: 'test-workspace-encryption-key-32-characters-minimum' };

test('workspace secrets use authenticated encryption and round-trip', () => {
  const encrypted = encryptWorkspaceSecret('workspace-specific-secret-value', env);
  assert.notEqual(encrypted, 'workspace-specific-secret-value');
  assert.match(encrypted, /^v1\./);
  assert.equal(decryptWorkspaceSecret(encrypted, env), 'workspace-specific-secret-value');
});
test('workspace secret cannot be decrypted with another key', () => {
  const encrypted = encryptWorkspaceSecret('secret', env);
  assert.throws(
    () => decryptWorkspaceSecret(encrypted, { WORKSPACE_ENCRYPTION_KEY: 'another-workspace-encryption-key-32-characters' }),
    (error) => error.code === 'WORKSPACE_SECRET_DECRYPT_FAILED',
  );
});

test('missing workspace encryption key keeps its actionable error code', () => {
  const encrypted = encryptWorkspaceSecret('secret', env);
  assert.throws(
    () => decryptWorkspaceSecret(encrypted, {}),
    (error) => error.code === 'WORKSPACE_ENCRYPTION_KEY_REQUIRED',
  );
});

test('Apps Script URL validation blocks arbitrary webhook hosts and dev URLs', () => {
  assert.equal(
    validateAppsScriptDeploymentUrl('https://script.google.com/macros/s/deployment-id/exec'),
    'https://script.google.com/macros/s/deployment-id/exec',
  );
  assert.throws(() => validateAppsScriptDeploymentUrl('https://example.com/hook'), /script.google.com/);
  assert.throws(() => validateAppsScriptDeploymentUrl('https://script.google.com/macros/s/deployment-id/dev'), /\/exec/);
});
