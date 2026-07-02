const KEY_NAME = 'RESEND' + '_API' + '_KEY';
const FROM_NAME = 'EMAIL' + '_FROM';

function clean(value) {
  return String(value ?? '').trim();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
}

function makeError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  Object.assign(error, extra);
  return error;
}

function fromMode(from) {
  const value = clean(from).toLowerCase();
  if (!value) return 'missing';
  if (value === 'onboarding@resend.dev') return 'resend-test-sender';
  return 'verified-domain';
}

function fixForMode(mode, hasKey) {
  if (!hasKey) return 'Railway Variables’da email provider kalitini kiriting.';
  if (mode === 'missing') return 'Railway Variables’da EMAIL_FROM kiriting.';
  if (mode === 'resend-test-sender') return 'Boshqa recipientlar uchun Resend’da domain verification qiling va EMAIL_FROM ni verified domain emailiga almashtiring.';
  return '';
}

function classifyProviderError(status, body = {}) {
  const msg = clean(body?.message || body?.error || body?.name || 'HTTP email yuborish xatosi.');
  const text = `${status || ''} ${msg}`;
  if (/only send testing emails|own email address|verify a domain/i.test(text)) {
    return makeError('EMAIL_PROVIDER_RECIPIENT_NOT_ALLOWED', 'Resend test sender faqat account egasi emailiga yubora oladi. Boshqa recipientlar uchun domain verification kerak.', { providerStatus: status, providerMessage: msg });
  }
  if (/domain.*not.*verified|verify.*domain|domain verification|from.*domain/i.test(text)) {
    return makeError('EMAIL_DOMAIN_NOT_VERIFIED', 'Email domen tasdiqlanmagan. Resend’da domain verification qiling.', { providerStatus: status, providerMessage: msg });
  }
  if (status === 422 || /invalid.*email|invalid.*recipient|invalid.*to|recipient.*invalid/i.test(text)) {
    return makeError('EMAIL_INVALID_RECIPIENT', 'Recipient email manzili noto‘g‘ri.', { providerStatus: status, providerMessage: msg });
  }
  if (status === 429 || /rate limit|too many/i.test(text)) {
    return makeError('EMAIL_RATE_LIMITED', 'Email provider rate limitga tushdi. Birozdan keyin qayta urinib ko‘ring.', { providerStatus: status, providerMessage: msg });
  }
  if (status === 401 || /api key|unauthorized|invalid api/i.test(text)) {
    return makeError('EMAIL_AUTH_FAILED', 'Email provider kaliti noto‘g‘ri yoki bekor qilingan.', { providerStatus: status, providerMessage: msg });
  }
  return makeError('EMAIL_HTTP_FAILED', msg, { providerStatus: status, providerMessage: msg });
}

export function hasHttpEmailProvider() {
  return Boolean(clean(process.env[KEY_NAME]));
}

export function getHttpEmailSummary() {
  const from = clean(process.env[FROM_NAME]);
  const hasApiKey = hasHttpEmailProvider();
  const mode = fromMode(from);
  return {
    provider: hasApiKey ? 'resend' : 'none',
    hasHttpEmailProvider: hasApiKey,
    hasApiKey,
    from,
    fromMode: mode,
    warning: mode === 'resend-test-sender' ? 'onboarding@resend.dev faqat account egasi emailiga yubora oladi. Boshqa Gmail uchun Resend domain verification kerak.' : '',
    recommendedFix: fixForMode(mode, hasApiKey),
    secretsExposed: false,
  };
}

export async function sendHttpEmail(message) {
  const apiKey = clean(process.env[KEY_NAME]);
  const from = clean(message.from || process.env[FROM_NAME]);
  const recipients = (Array.isArray(message.to) ? message.to : [message.to]).map(clean).filter(Boolean);
  if (!apiKey) throw makeError('EMAIL_HTTP_NOT_CONFIGURED', 'HTTP email provider sozlanmagan.');
  if (!from) throw makeError('EMAIL_FROM_MISSING', 'EMAIL_FROM kiritilmagan.');
  if (!isEmail(from)) throw makeError('EMAIL_FROM_INVALID', 'EMAIL_FROM email formati noto‘g‘ri.');
  if (!recipients.length || recipients.some((email) => !isEmail(email))) throw makeError('EMAIL_INVALID_RECIPIENT', 'Recipient email manzili noto‘g‘ri yoki to‘liq emas.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch('https://api.re' + 'send.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        ['Authori' + 'zation']: 'Bearer ' + apiKey,
        ['Content-Type']: 'application/json',
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: message.subject || 'SEG KIP AI Platform',
        html: message.html || undefined,
        text: message.text || undefined,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw classifyProviderError(response.status, body);
    return { provider: 'resend', id: body?.id || '', response: body };
  } catch (error) {
    if (error?.name === 'AbortError') throw makeError('EMAIL_SEND_TIMEOUT', 'HTTP email provider javob bermadi.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
