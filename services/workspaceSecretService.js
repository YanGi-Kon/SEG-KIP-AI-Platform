import crypto from 'node:crypto';

function clean(value) { return String(value ?? '').trim(); }

function secretError(message, code = 'WORKSPACE_SECRET_ERROR', statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}
function encryptionKey(env = process.env) {
  const source = clean(env.WORKSPACE_ENCRYPTION_KEY);
  if (source.length < 32) {
    throw secretError('WORKSPACE_ENCRYPTION_KEY kamida 32 belgidan iborat bo‘lishi shart.', 'WORKSPACE_ENCRYPTION_KEY_REQUIRED', 500);
  }
  return crypto.createHash('sha256').update(source).digest();
}

export function encryptWorkspaceSecret(value, env = process.env) {
  const plaintext = clean(value);
  if (!plaintext) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptWorkspaceSecret(value, env = process.env) {
  const encoded = clean(value);
  if (!encoded) return '';
  const [version, ivRaw, tagRaw, encryptedRaw] = encoded.split('.');
  if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) {
    throw secretError('Workspace secret formati noto‘g‘ri.', 'WORKSPACE_SECRET_INVALID', 500);
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(env), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64url')), decipher.final()]).toString('utf8');
  } catch (_) {
    throw secretError('Workspace secretni ochib bo‘lmadi.', 'WORKSPACE_SECRET_DECRYPT_FAILED', 500);
  }
}

export function validateAppsScriptDeploymentUrl(value) {
  const input = clean(value);
  if (!input) return '';
  let url;
  try { url = new URL(input); } catch (_) { throw secretError('Apps Script URL noto‘g‘ri.', 'DRIVE_APPS_SCRIPT_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)) {
    throw secretError('Faqat script.google.com dagi /exec Apps Script URL qabul qilinadi.', 'DRIVE_APPS_SCRIPT_URL_INVALID');
  }
  return url.toString();
}
