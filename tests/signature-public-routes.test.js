import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicSignatureRequest } from '../routes/signatures.js';

test('email approval flow is public because its signed token provides authorization', () => {
  assert.equal(isPublicSignatureRequest('GET', '/document/approve/signed.jwt.token'), true);
  assert.equal(isPublicSignatureRequest('POST', '/document/approve'), true);
  assert.equal(isPublicSignatureRequest('GET', '/signature/render/signed-image-token'), true);
});

test('admin login remains reachable without an access token', () => {
  assert.equal(isPublicSignatureRequest('POST', '/auth/login'), true);
});

test('workspace signature operations remain protected', () => {
  assert.equal(isPublicSignatureRequest('GET', '/signers'), false);
  assert.equal(isPublicSignatureRequest('POST', '/document/send'), false);
  assert.equal(isPublicSignatureRequest('GET', '/audit'), false);
  assert.equal(isPublicSignatureRequest('GET', '/document/approve'), false);
  assert.equal(isPublicSignatureRequest('DELETE', '/document/approve/signed.jwt.token'), false);
});
