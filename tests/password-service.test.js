import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from '../services/passwordService.js';

test('password policy enforces the current supported length bounds', () => {
  assert.throws(() => validatePasswordStrength('short'), /6-200/);
  assert.equal(validatePasswordStrength('123456'), '123456');
  assert.equal(validatePasswordStrength('alllowercase12345'), 'alllowercase12345');
  assert.throws(() => validatePasswordStrength('x'.repeat(201)), /6-200/);
});

test('scrypt password hashes are salted and verifiable', async () => {
  const password = 'StrongPassword123';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, /^scrypt\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('WrongPassword123', first), false);
});

test('malformed password hashes fail closed', async () => {
  assert.equal(await verifyPassword('StrongPassword123', ''), false);
  assert.equal(await verifyPassword('StrongPassword123', 'scrypt$bad'), false);
  assert.equal(await verifyPassword('StrongPassword123', 'pbkdf2$1$2$3$4$5'), false);
});
