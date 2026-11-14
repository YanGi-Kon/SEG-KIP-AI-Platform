import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('project source and legacy Sheet APIs require a platform administrator', () => {
  for (const route of ['routes/project.js', 'routes/base.js', 'routes/workbook.js', 'routes/menu.js']) {
    assert.match(read(route), /router\.use\(requireAccessToken, requirePlatformRole\('admin', 'super_admin'\)\)/, route);
  }
});

test('cross-origin access is limited to the configured site origins', () => {
  const server = read('server.js');
  assert.match(server, /CORS_ALLOWED_ORIGINS/);
  assert.match(server, /corsAllowedOrigins\.has\(origin\)/);
  assert.doesNotMatch(server, /origin:\s*["']\*["']/);
});

test('CI/CD webhook requires verification and CSP is report-only', () => {
  const webhook = read('routes/webhook.js');
  assert.match(webhook, /verifyCiWebhookRequest\(req\)/);
  const server = read('server.js');
  assert.match(server, /Content-Security-Policy-Report-Only/);
  assert.match(server, /req\.rawBody = Buffer\.from\(buffer\)/);
});

test('AI API is Workspace-authorized, rate-limited, and reads the selected Workspace Sheet', () => {
  const route = read('routes/chat.js');
  assert.match(route, /requireAccessToken/);
  assert.match(route, /requireWorkspaceRequestPermission\('workspace:read'\)/);
  assert.match(route, /router\.post\("\/", requireAiRateLimit/);
  assert.match(route, /resolveWorkspaceGoogleConfig\(workspace\)/);
  assert.doesNotMatch(route, /getSpreadsheetId\(\)/);

  const frontend = read('public/js/app.js');
  assert.match(frontend, /Authorization = `Bearer \$\{token\}`/);
  assert.match(frontend, /headers\['x-workspace-id'\] = workspaceId/);
});

test('instrument passport actions use the module-specific permission', () => {
  const route = read('routes/ulchov.js');
  assert.match(route, /router\.delete\('\/passports\/:key\/documents\/:documentId',workspaceGuards\('passports:manage'\)/);
  assert.match(route, /router\.put\('\/passports\/:key\/documents\/:documentId',workspaceGuards\('passports:manage'\)/);
  assert.match(route, /router\.post\('\/passports\/:key\/documents',workspaceGuards\('passports:manage'\)/);
});
