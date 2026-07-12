import crypto from 'crypto';

const ENCRYPTION_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function clean(value) {
  return String(value ?? '').trim();
}

function encryptionError(message, code = 'WORKSPACE_ENCRYPTION_ERROR', statusCode = 500) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function getWorkspaceEncryptionKey() {
  const secret = clean(process.env.WORKSPACE_ENCRYPTION_KEY);
  if (secret.length < 32) {
    throw encryptionError(
      'WORKSPACE_ENCRYPTION_KEY kamida 32 belgidan iborat bo‘lishi kerak',
      'WORKSPACE_ENCRYPTION_KEY_MISSING',
      500,
    );
  }

  if (/^[0-9a-f]{64}$/i.test(secret)) {
    return Buffer.from(secret, 'hex');
  }

  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptWorkspaceJsonSecret(value) {
  if (!value || typeof value !== 'object') {
    throw encryptionError('Encrypt qilish uchun JSON object kerak', 'WORKSPACE_SECRET_INVALID', 400);
  }

  const key = getWorkspaceEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [ENCRYPTION_VERSION, iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

export function decryptWorkspaceJsonSecret(payload) {
  const raw = clean(payload);
  if (!raw) return null;

  const [version, ivHex, tagHex, encryptedHex] = raw.split(':');
  if (version !== ENCRYPTION_VERSION || !ivHex || !tagHex || !encryptedHex) {
    throw encryptionError('Workspace encrypted JSON formati noto‘g‘ri', 'WORKSPACE_SECRET_FORMAT_INVALID', 500);
  }

  try {
    const key = getWorkspaceEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(decrypted);
  } catch (error) {
    throw encryptionError(
      `Workspace encrypted JSON ochilmadi: ${error.message}`,
      'WORKSPACE_SECRET_DECRYPT_FAILED',
      500,
    );
  }
}
