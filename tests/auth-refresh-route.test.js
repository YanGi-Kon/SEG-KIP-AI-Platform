import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../routes/auth.js', import.meta.url), 'utf8');

test('missing refresh cookie is handled as an expected 401 without calling session rotation', () => {
  const missingGuard = source.indexOf('if (!refreshToken)');
  const rotateCall = source.indexOf('const session = await rotateUserSession(refreshToken');

  assert.notEqual(missingGuard, -1);
  assert.notEqual(rotateCall, -1);
  assert.ok(missingGuard < rotateCall);
  assert.match(source, /code:\s*'REFRESH_TOKEN_REQUIRED'/);
  assert.match(source, /return res\.status\(401\)\.json/);
});

test('only unexpected server-side auth failures emit stack traces', () => {
  assert.match(source, /if \(status >= 500\) console\.error\('\[Auth Error\]', error\)/);
  assert.doesNotMatch(source, /function handleError\(res, error\) \{\s*console\.error/);
});
