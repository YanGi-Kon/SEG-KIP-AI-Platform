import test from 'node:test';
import assert from 'node:assert/strict';
import { getAppConfig, parseBoolean, redactConfig } from '../config/env.js';

test('parseBoolean supports explicit true and false values', () => {
  assert.equal(parseBoolean('true'), true);
  assert.equal(parseBoolean('1'), true);
  assert.equal(parseBoolean('off'), false);
  assert.equal(parseBoolean(undefined, true), true);
  assert.throws(() => parseBoolean('maybe'), /Invalid boolean/);
});

test('legacy mode has safe defaults without database', () => {
  const config = getAppConfig({});
  assert.equal(config.features.workspaceModeEnabled, false);
  assert.equal(config.features.legacyConfigEnabled, true);
  assert.equal(config.timeZone, 'Asia/Tashkent');
  assert.equal(config.database.url, '');
});

test('workspace mode requires a database', () => {
  assert.throws(
    () => getAppConfig({ WORKSPACE_MODE_ENABLED: 'true' }),
    /DATABASE_URL is required/,
  );
});

test('workspace mode requires platform Google credentials', () => {
  assert.throws(
    () => getAppConfig({
      WORKSPACE_MODE_ENABLED: 'true',
      DATABASE_URL: 'postgres://user:pass@localhost/db',
      APPROVAL_JWT_SECRET: 'a'.repeat(32),
    }),
    /platform Google Service Account is required/,
  );
});

test('production workspace auth requires strong access and refresh secrets', () => {
  assert.throws(
    () => getAppConfig({
      NODE_ENV: 'production',
      WORKSPACE_MODE_ENABLED: 'true',
      DATABASE_URL: 'postgres://user:pass@localhost/db',
      GOOGLE_SERVICE_ACCOUNT_JSON: '{}',
      APPROVAL_JWT_SECRET: 'a'.repeat(32),
    }),
    /ACCESS_TOKEN_SECRET/,
  );
});

test('redactConfig never returns raw secrets or database URL', () => {
  const config = getAppConfig({
    WORKSPACE_MODE_ENABLED: 'true',
    DATABASE_URL: 'postgres://secret-user:secret-pass@localhost/db',
    GOOGLE_SERVICE_ACCOUNT_JSON: '{"private_key":"secret"}',
    APPROVAL_JWT_SECRET: 'a'.repeat(32),
    ACCESS_TOKEN_SECRET: 'b'.repeat(32),
    REFRESH_TOKEN_SECRET: 'c'.repeat(32),
  });
  const redacted = redactConfig(config);
  const serialized = JSON.stringify(redacted);
  assert.equal(redacted.database.configured, true);
  assert.equal(redacted.google.serviceAccountConfigured, true);
  assert.equal(serialized.includes('secret-pass'), false);
  assert.equal(serialized.includes('private_key'), false);
  assert.equal(serialized.includes('a'.repeat(32)), false);
});
