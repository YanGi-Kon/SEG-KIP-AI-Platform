import crypto from 'node:crypto';

function clean(value) {
  return String(value ?? '').trim();
}
function providerError(message, code, statusCode = 400, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  Object.assign(error, details);
  return error;
}

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function signAppsScriptRequest({ action, payload, timestamp, nonce }, secret) {
  const canonical = canonicalJson({ action, nonce, payload, timestamp });
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

export function classifyAppsScriptDriveError(error) {
  if (/^DRIVE_/.test(clean(error?.code)) && error?.statusCode) return error;
  if (error?.name === 'AbortError') {
    return providerError('Personal Drive Apps Script javob bermadi.', 'DRIVE_APPS_SCRIPT_TIMEOUT', 504);
  }
  const status = Number(error?.statusCode || error?.response?.status || 0);
  if (status === 401 || status === 403) {
    return providerError('Personal Drive Apps Script autentifikatsiyasi rad etildi.', 'DRIVE_APPS_SCRIPT_AUTH_FAILED', 403);
  }
  if (status >= 500) {
    return providerError('Personal Drive Apps Script vaqtinchalik xatolik qaytardi.', 'DRIVE_UPLOAD_FAILED', 502);
  }
  return providerError(
    clean(error?.message) || 'Personal Drive Apps Script amali bajarilmadi.',
    clean(error?.code) || 'DRIVE_APPS_SCRIPT_FAILED',
    status >= 400 && status < 600 ? status : 400,
  );
}

export class AppsScriptPersonalDriveProvider {
  constructor({ url, secret, fetchImpl = globalThis.fetch, timeoutMs = 30000 }) {
    this.url = clean(url);
    this.secret = clean(secret);
    this.fetchImpl = fetchImpl;
    this.timeoutMs = Math.max(1000, Number(timeoutMs || 30000));
    this.providerName = 'apps_script_personal_drive';
    if (!this.url || !this.secret) {
      throw providerError(
        'Personal Drive Apps Script URL va secret to‘liq sozlanmagan.',
        'DRIVE_APPS_SCRIPT_CONFIG_REQUIRED',
      );
    }
    if (typeof this.fetchImpl !== 'function') {
      throw providerError('Fetch API mavjud emas.', 'DRIVE_APPS_SCRIPT_FETCH_UNAVAILABLE', 500);
    }
  }

  async request(action, payload = {}) {
    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const envelope = { action, payload, timestamp, nonce };
    const signature = signAppsScriptRequest(envelope, this.secret);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...envelope, signature }),
        redirect: 'follow',
        signal: controller.signal,
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (_) {
        if (response.status === 404) {
          throw providerError(
            'Apps Script /exec deployment topilmadi yoki faol emas.',
            'DRIVE_APPS_SCRIPT_DEPLOYMENT_NOT_FOUND',
            404,
            { recommendedFix: 'Apps Script’da Deploy → Manage deployments orqali Web app deployment’ni qayta yarating va yangi /exec URL’ni saqlang.' },
          );
        }
        throw providerError(
          'Apps Script JSON javob qaytarmadi.',
          'DRIVE_APPS_SCRIPT_INVALID_RESPONSE',
          502,
          { responseStatus: response.status, responseContentType: response.headers?.get?.('content-type') || '' },
        );
      }
      if (!response.ok || data.ok === false) {
        throw providerError(
          clean(data.error) || `Apps Script HTTP ${response.status}`,
          clean(data.code) || (response.status >= 500 ? 'DRIVE_UPLOAD_FAILED' : 'DRIVE_APPS_SCRIPT_FAILED'),
          Number(data.statusCode || response.status || 400),
        );
      }
      return data;
    } catch (error) {
      throw classifyAppsScriptDriveError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  async validateFolder(folderId, { writeTest = true } = {}) {
    const result = await this.request('validate_folder', { folderId: clean(folderId), writeTest: Boolean(writeTest) });
    return {
      ok: true,
      folderId: clean(result.folderId) || clean(folderId),
      folderName: clean(result.folderName),
      folderUrl: clean(result.folderUrl),
      driveId: '',
      canAddChildren: true,
      canEdit: true,
      provider: this.providerName,
      writeTestPassed: !writeTest || Boolean(result.writeTestPassed),
    };
  }

  async ensureSubfolder(rootFolderId, name) {
    const result = await this.request('ensure_subfolder', { rootFolderId: clean(rootFolderId), name: clean(name) });
    return {
      folderId: clean(result.folderId),
      folderName: clean(result.folderName) || clean(name),
      created: Boolean(result.created),
    };
  }

  async renderAndUploadPdf({ rootFolderId, targetFolderId, name, html }) {
    const result = await this.request('render_and_upload_pdf', {
      rootFolderId: clean(rootFolderId),
      targetFolderId: clean(targetFolderId),
      name: clean(name),
      html: String(html || ''),
    });
    const fileId = clean(result.fileId);
    if (!fileId) {
      throw providerError(
        'Apps Script PDF yaratdi, lekin Drive file ID qaytarmadi.',
        'DRIVE_UPLOAD_RESULT_INVALID',
        502,
      );
    }
    return { fileId, url: clean(result.url) };
  }
}

export function createAppsScriptPersonalDriveProvider(env = process.env, options = {}) {
  return new AppsScriptPersonalDriveProvider({
    url: env.PERSONAL_DRIVE_APPS_SCRIPT_URL,
    secret: env.PERSONAL_DRIVE_APPS_SCRIPT_SECRET,
    timeoutMs: env.PERSONAL_DRIVE_APPS_SCRIPT_TIMEOUT_MS || 30000,
    ...options,
  });
}
