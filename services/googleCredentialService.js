import { google } from 'googleapis';

function clean(value) {
  return String(value ?? '').trim();
}

function makeError(message, code = 'GOOGLE_CREDENTIAL_ERROR', statusCode = 400, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  Object.assign(error, details);
  return error;
}

function safeJsonParse(raw, source) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw makeError(
      source === 'BASE64'
        ? 'GOOGLE_SERVICE_ACCOUNT_BASE64 JSON parse xato'
        : 'GOOGLE_SERVICE_ACCOUNT_JSON parse xato',
      source === 'BASE64' ? 'GOOGLE_SERVICE_ACCOUNT_BASE64_INVALID' : 'GOOGLE_SERVICE_ACCOUNT_JSON_INVALID',
      400,
      { parseMessage: error.message },
    );
  }
}

function normalizePrivateKey(value = '') {
  return String(value || '').replace(/\\n/g, '\n').trim();
}

function sanitizeBase64(raw) {
  return clean(raw)
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, '');
}

function parseServiceAccountFromBase64(raw) {
  const value = sanitizeBase64(raw);
  if (!value) return null;
  if (value.startsWith('{')) return safeJsonParse(value, 'BASE64');
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8').trim();
    return safeJsonParse(decoded, 'BASE64');
  } catch (error) {
    throw makeError('GOOGLE_SERVICE_ACCOUNT_BASE64 decode xato', 'GOOGLE_SERVICE_ACCOUNT_BASE64_INVALID', 400, {
      parseMessage: error.message,
    });
  }
}

function parseServiceAccountFromJson(raw) {
  const value = clean(raw).replace(/^['"]|['"]$/g, '');
  if (!value) return null;
  return safeJsonParse(value, 'JSON');
}

function validateServiceAccountShape(serviceAccount, source = 'UNKNOWN') {
  if (!serviceAccount || typeof serviceAccount !== 'object') {
    throw makeError('SERVICE ACCOUNT JSON topilmadi', 'GOOGLE_SERVICE_ACCOUNT_MISSING', 400, { credentialSource: source });
  }
  const privateKey = normalizePrivateKey(serviceAccount.private_key);
  const hasPrivateKey = Boolean(privateKey);
  const privateKeyBegins = privateKey.startsWith('-----BEGIN PRIVATE KEY-----');
  const privateKeyEnds = privateKey.endsWith('-----END PRIVATE KEY-----');
  const publicInfo = {
    credentialSource: source,
    clientEmail: clean(serviceAccount.client_email),
    projectId: clean(serviceAccount.project_id),
    hasPrivateKey,
    privateKeyBegins,
    privateKeyEnds,
  };
  if (serviceAccount.type && serviceAccount.type !== 'service_account') {
    throw makeError('JSON type service_account emas', 'GOOGLE_SERVICE_ACCOUNT_TYPE_INVALID', 400, publicInfo);
  }
  if (!publicInfo.clientEmail) {
    throw makeError('client_email topilmadi', 'GOOGLE_SERVICE_ACCOUNT_EMAIL_MISSING', 400, publicInfo);
  }
  if (!publicInfo.projectId) {
    throw makeError('project_id topilmadi', 'GOOGLE_SERVICE_ACCOUNT_PROJECT_MISSING', 400, publicInfo);
  }
  if (!hasPrivateKey || !privateKeyBegins || !privateKeyEnds) {
    throw makeError('private_key formati noto‘g‘ri', 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_INVALID', 400, publicInfo);
  }
  return { ...serviceAccount, private_key: privateKey };
}

export function getGoogleCredentialSummary() {
  const hasBase64 = Boolean(clean(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64));
  const hasJson = Boolean(clean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON));
  const preferredSource = hasBase64 ? 'BASE64' : hasJson ? 'JSON' : 'NONE';
  return {
    hasBase64,
    hasJson,
    conflict: hasBase64 && hasJson,
    preferredSource,
  };
}

export function resolveEnvServiceAccount() {
  const summary = getGoogleCredentialSummary();
  let serviceAccount = null;
  if (summary.hasBase64) {
    serviceAccount = parseServiceAccountFromBase64(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64);
    return {
      serviceAccount: validateServiceAccountShape(serviceAccount, 'BASE64'),
      credentialSource: 'BASE64',
      credentialConflict: summary.conflict,
    };
  }
  if (summary.hasJson) {
    serviceAccount = parseServiceAccountFromJson(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return {
      serviceAccount: validateServiceAccountShape(serviceAccount, 'JSON'),
      credentialSource: 'JSON',
      credentialConflict: false,
    };
  }
  throw makeError('Railway Variables da GOOGLE_SERVICE_ACCOUNT_BASE64 kiritilmagan', 'GOOGLE_SERVICE_ACCOUNT_MISSING', 400, summary);
}

export function resolvePlatformGoogleConfig(input = {}) {
  const { serviceAccount, credentialSource, credentialConflict } = resolveEnvServiceAccount();
  const spreadsheetUrl = clean(process.env.GOOGLE_SPREADSHEET_URL || process.env.GOOGLE_SPREADSHEET_ID || input.spreadsheetUrl || input.spreadsheetId);
  if (!spreadsheetUrl) throw makeError('Google Sheets havolasi kiritilmagan', 'GOOGLE_SPREADSHEET_URL_MISSING');
  return { spreadsheetUrl, serviceAccount, credentialSource, credentialConflict };
}

export async function diagnoseGoogleCredentials({ authorize = false, scopes = ['https://www.googleapis.com/auth/drive'] } = {}) {
  const summary = getGoogleCredentialSummary();
  try {
    const { serviceAccount, credentialSource, credentialConflict } = resolveEnvServiceAccount();
    const privateKey = normalizePrivateKey(serviceAccount.private_key);
    const result = {
      ok: true,
      credentialSource,
      hasBase64: summary.hasBase64,
      hasJson: summary.hasJson,
      conflict: credentialConflict,
      clientEmail: clean(serviceAccount.client_email),
      projectId: clean(serviceAccount.project_id),
      hasPrivateKey: Boolean(privateKey),
      privateKeyBegins: privateKey.startsWith('-----BEGIN PRIVATE KEY-----'),
      privateKeyEnds: privateKey.endsWith('-----END PRIVATE KEY-----'),
      authorizeTested: Boolean(authorize),
      authorizeOk: false,
    };
    if (authorize) {
      const auth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: privateKey,
        scopes,
      });
      await auth.authorize();
      result.authorizeOk = true;
    }
    return result;
  } catch (error) {
    return {
      ok: false,
      ...summary,
      code: error.code || 'GOOGLE_CREDENTIAL_DIAGNOSTIC_FAILED',
      error: error.message,
      credentialSource: error.credentialSource || summary.preferredSource,
      clientEmail: error.clientEmail || '',
      projectId: error.projectId || '',
      hasPrivateKey: error.hasPrivateKey ?? false,
      privateKeyBegins: error.privateKeyBegins ?? false,
      privateKeyEnds: error.privateKeyEnds ?? false,
      parseMessage: error.parseMessage || '',
      authorizeTested: Boolean(authorize),
      authorizeOk: false,
    };
  }
}
