import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from '../services/passwordService.js';

test('password policy requires length and character classes', () => {
  assert.throws(() => validatePasswordStrength('short'), /12-200/);
  assert.throws(() => validatePasswordStrength('alllowercase12345'), /uppercase/);
  assert.throws(() => validatePasswordStrength('ALLUPPERCASE12345'), /lowercase/);
  assert.throws(() => validatePasswordStrength('NoNumbersInThisPassword'), /numeric/);
  assert.equal(validatePasswordStrength('StrongPassword123'), 'StrongPassword123');
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
