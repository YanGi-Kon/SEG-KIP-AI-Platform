import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const actsFile = new URL('../public/js/acts.js', import.meta.url);
const loginFile = new URL('../public/js/saneg-login-gate-manual.js', import.meta.url);

test('Acts Journal frontend uses Workspace endpoints and no legacy credential storage keys', async () => {
  const source = await fs.readFile(actsFile, 'utf8');
  assert.match(source, /\/api\/workspaces\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(source, /acts\/monthly-analysis/);
  assert.match(source, /acts\/reports\/daily/);
  assert.equal(source.includes('acts_service_account'), false);
  assert.equal(source.includes('acts_sheet_url'), false);
  assert.equal(source.includes('acts_sheet_name'), false);
  assert.equal(source.includes('localStorage.setItem(KEYS.service'), false);
});

test('manual login gate never calls auth refresh during boot', async () => {
  const source = await fs.readFile(loginFile, 'utf8');
  assert.equal(source.includes('/api/auth/refresh'), false);
  assert.match(source, /sessionStorage\.removeItem\(ACCESS_TOKEN_KEY\)/);
  assert.match(source, /\/api\/auth\/login/);
});
