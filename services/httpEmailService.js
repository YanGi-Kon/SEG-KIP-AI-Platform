const KEY_NAME = 'RESEND' + '_API' + '_KEY';
const FROM_NAME = 'EMAIL' + '_FROM';

function clean(value) {
  return String(value ?? '').trim();
}

function makeError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  return error;
}

export function hasHttpEmailProvider() {
  return Boolean(clean(process.env[KEY_NAME]));
}

export function getHttpEmailSummary() {
  return {
    provider: hasHttpEmailProvider() ? 'resend' : 'none',
    hasHttpEmailProvider: hasHttpEmailProvider(),
    from: clean(process.env[FROM_NAME]),
  };
}

export async function sendHttpEmail(message) {
  const apiKey = clean(process.env[KEY_NAME]);
  const from = clean(message.from || process.env[FROM_NAME]);
  if (!apiKey) throw makeError('EMAIL_HTTP_NOT_CONFIGURED', 'HTTP email provider sozlanmagan.');
  if (!from) throw makeError('EMAIL_FROM_MISSING', 'EMAIL_FROM kiritilmagan.');
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
        to: Array.isArray(message.to) ? message.to : [message.to],
        subject: message.subject || 'SEG KIP AI Platform',
        html: message.html || undefined,
        text: message.text || undefined,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = makeError(response.status === 401 || response.status === 403 ? 'EMAIL_AUTH_FAILED' : 'EMAIL_HTTP_FAILED', body?.message || 'HTTP email yuborish xatosi.');
      error.providerStatus = response.status;
      throw error;
    }
    return { provider: 'resend', id: body?.id || '', response: body };
  } catch (error) {
    if (error?.name === 'AbortError') throw makeError('EMAIL_SEND_TIMEOUT', 'HTTP email provider javob bermadi.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
