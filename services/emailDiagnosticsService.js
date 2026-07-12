import nodemailer from 'nodemailer';
import { hasHttpEmailProvider } from './httpEmailService.js';
import { getEmailProviderTestSummary } from './emailProviderTestService.js';

const USER_KEYS = ['SMTP_' + 'USER', 'GMAIL_' + 'USER'];
const SECRET_KEYS = ['SMTP_' + 'PASS', 'GMAIL_' + 'APP_' + 'PASSWORD'];
const FROM_KEY = 'SMTP_' + 'FROM';
const HOST_KEY = 'SMTP_' + 'HOST';
const PORT_KEY = 'SMTP_' + 'PORT';
const SECURE_KEY = 'SMTP_' + 'SECURE';

function clean(value) {
  return String(value ?? '').trim();
}

function firstEnv(keys) {
  for (const key of keys) {
    const value = clean(process.env[key]);
    if (value) return value;
  }
  return '';
}

function bool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return !/^(false|0|no)$/i.test(String(value));
}

function publicConfig() {
  const sender = firstEnv(USER_KEYS);
  const hasSecret = Boolean(firstEnv(SECRET_KEYS));
  const host = clean(process.env[HOST_KEY]) || 'smtp.gmail.com';
  const port = Number(process.env[PORT_KEY] || 465);
  const secure = bool(process.env[SECURE_KEY], port === 465);
  const from = clean(process.env[FROM_KEY]) || sender;
  return { sender, from, host, port, secure, hasUser: Boolean(sender), hasSecret };
}

function extractSafeDebug(error, extra = {}) {
  return {
    rawCode: clean(error?.code),
    rawErrno: clean(error?.errno),
    rawSyscall: clean(error?.syscall),
    responseCode: Number.isFinite(Number(error?.responseCode)) ? Number(error.responseCode) : undefined,
    ...extra,
  };
}

function createError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  Object.assign(error, extra);
  return error;
}

function logSmtpError(context, error, cfg = {}) {
  console.error(`[email-diagnostics] ${context}`, {
    message: error?.message || '',
    code: error?.code || '',
    command: error?.command || '',
    response: error?.response || '',
    responseCode: error?.responseCode || '',
    errno: error?.errno || '',
    syscall: error?.syscall || '',
    address: error?.address || '',
    port: error?.port || cfg.port || '',
    host: cfg.host || '',
    secure: typeof cfg.secure === 'boolean' ? cfg.secure : undefined,
    stack: error?.stack || '',
  });
}

function classify(error, cfg = {}) {
  if (error?.code === 'EMAIL_CONFIG_MISSING') {
    return createError(
      'EMAIL_CONFIG_MISSING',
      error?.message || 'Email yuborish sozlanmagan.',
      extractSafeDebug(error, { host: cfg.host, port: cfg.port, secure: cfg.secure })
    );
  }

  const text = `${error?.message || ''} ${error?.code || ''} ${error?.command || ''}`;
  const safeDebug = extractSafeDebug(error, { host: cfg.host, port: cfg.port, secure: cfg.secure });

  if (/EAUTH|Invalid login|Username and Password not accepted|535|534|auth/i.test(text)) {
    return createError('EMAIL_AUTH_FAILED', 'Email login yoki yuborish kaliti noto‘g‘ri.', safeDebug);
  }
  if (/timeout|ETIMEDOUT|Greeting never received|Socket closed/i.test(text)) {
    return createError('EMAIL_SEND_TIMEOUT', 'Email server javob bermadi yoki ulanish vaqti tugadi.', safeDebug);
  }
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ECONNRESET|connect/i.test(text)) {
    return createError('EMAIL_CONNECTION_FAILED', 'Email serverga ulanishda xatolik.', safeDebug);
  }
  return createError('EMAIL_SEND_FAILED', error?.message || 'Email yuborish xatosi.', safeDebug);
}

export function createSafeEmailTransport() {
  const cfg = publicConfig();
  const secret = firstEnv(SECRET_KEYS);
  if (!cfg.hasUser || !cfg.hasSecret) {
    throw createError('EMAIL_CONFIG_MISSING', 'Email yuborish sozlanmagan.', extractSafeDebug(null, cfg));
  }
  return {
    transporter: nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.sender, pass: secret },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
      logger: false,
      debug: false,
    }),
    from: cfg.from,
    public: cfg,
  };
}

export async function verifySafeEmailTransport() {
  if (hasHttpEmailProvider()) return getEmailProviderTestSummary();
  const cfg = publicConfig();
  try {
    const { transporter, public: pub } = createSafeEmailTransport();
    await transporter.verify();
    return { ok: true, emailReady: true, ...pub, message: 'Email yuborish sozlamasi tayyor.' };
  } catch (error) {
    logSmtpError('verify transport failed', error, cfg);
    const classified = classify(error, cfg);
    return {
      ok: false,
      emailReady: false,
      code: classified.code,
      error: classified.message,
      ...cfg,
      rawCode: classified.rawCode || undefined,
      rawErrno: classified.rawErrno || undefined,
      rawSyscall: classified.rawSyscall || undefined,
      responseCode: classified.responseCode,
    };
  }
}

export async function sendSafeEmail(mail) {
  const cfg = publicConfig();
  try {
    const { transporter, from } = createSafeEmailTransport();
    return await transporter.sendMail({ ...mail, from: mail.from || from });
  } catch (error) {
    logSmtpError('send mail failed', error, cfg);
    throw classify(error, cfg);
  }
}
