import { createHmac, timingSafeEqual } from 'node:crypto';

const MIN_SECRET_LENGTH = 32;

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function verifyCiWebhookRequest(req, secret = process.env.CI_WEBHOOK_SECRET) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    return { ok: false, status: 503, code: 'WEBHOOK_SECRET_NOT_CONFIGURED' };
  }

  const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from('');
  const githubSignature = req.get?.('x-hub-signature-256') || req.headers?.['x-hub-signature-256'];
  const segSignature = req.get?.('x-seg-webhook-signature') || req.headers?.['x-seg-webhook-signature'];
  const authorization = req.get?.('authorization') || req.headers?.authorization;
  const signature = githubSignature || segSignature;

  if (signature) {
    const match = /^sha256=([a-f0-9]{64})$/i.exec(String(signature));
    if (!match) return { ok: false, status: 401, code: 'INVALID_WEBHOOK_SIGNATURE' };
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return safeEqual(match[1].toLowerCase(), expected)
      ? { ok: true }
      : { ok: false, status: 401, code: 'INVALID_WEBHOOK_SIGNATURE' };
  }

  const bearer = /^Bearer\s+(.+)$/i.exec(String(authorization || ''));
  if (bearer && safeEqual(bearer[1], secret)) return { ok: true };
  return { ok: false, status: 401, code: 'INVALID_WEBHOOK_SIGNATURE' };
}
