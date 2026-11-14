import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyCiWebhookRequest } from '../services/webhookSecurity.js';
import { formatCiCdMessage } from '../routes/webhook.js';

const secret = 'test-secret-which-is-at-least-32-characters-long';
const body = Buffer.from('{"type":"DEPLOY","status":"SUCCESS"}');
const sign = (value = body) => `sha256=${createHmac('sha256', secret).update(value).digest('hex')}`;
const request = (headers = {}, rawBody = body) => ({ headers, rawBody });

test('accepts GitHub HMAC signature for the exact raw body', () => {
  assert.deepEqual(verifyCiWebhookRequest(request({ 'x-hub-signature-256': sign() }), secret), { ok: true });
});

test('rejects a signature when the body was changed', () => {
  const changed = Buffer.from('{"type":"DEPLOY","status":"FAILED"}');
  const result = verifyCiWebhookRequest(request({ 'x-hub-signature-256': sign() }, changed), secret);
  assert.equal(result.status, 401);
});

test('accepts bearer secret for CI senders', () => {
  assert.deepEqual(verifyCiWebhookRequest(request({ authorization: `Bearer ${secret}` }), secret), { ok: true });
});

test('fails closed when secret is absent or too short', () => {
  assert.equal(verifyCiWebhookRequest(request(), '').code, 'WEBHOOK_SECRET_NOT_CONFIGURED');
  assert.equal(verifyCiWebhookRequest(request(), 'short').status, 503);
});

test('rejects missing or invalid authentication', () => {
  assert.equal(verifyCiWebhookRequest(request(), secret).status, 401);
  assert.equal(verifyCiWebhookRequest(request({ authorization: 'Bearer wrong' }), secret).status, 401);
});

test('formats Railway deployment event payload and escapes Telegram HTML', () => {
  const message = formatCiCdMessage({
    type: 'Deployment.failed',
    details: { status: 'FAILED', commitMessage: '<bad & unsafe>' },
    resource: {
      project: { name: 'SEG' },
      environment: { name: 'production' },
      service: { name: 'web' },
    },
  });
  assert.match(message, /Deploy FAILED/);
  assert.match(message, /Project:<\/b> SEG/);
  assert.match(message, /&lt;bad &amp; unsafe&gt;/);
  assert.doesNotMatch(message, /<bad/);
});
