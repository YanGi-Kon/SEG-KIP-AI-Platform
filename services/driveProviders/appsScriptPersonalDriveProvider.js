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

function classifyPassportAdapterError(error) {
  if (error?.code === 'DRIVE_APPS_SCRIPT_ACTION_INVALID') {
    return providerError(
      'Personal Drive Apps Script eskirgan: Passport.gs qo‘shilib /exec deployment yangilanishi kerak.',
      'PASSPORT_APPS_SCRIPT_UPDATE_REQUIRED',
      400,
      { recommendedFix: 'Apps Script loyihasiga repositorydagi apps-script/Passport.gs faylini qo‘shing, Drive API v3 xizmatini yoqing va Deploy → Manage deployments → Edit → New version → Deploy qiling.' },
    );
  }
  if (error?.code === 'PASSPORT_ADVANCED_DRIVE_REQUIRED') {
    return providerError(
      'Personal Drive Apps Scriptda Advanced Drive service v3 yoqilmagan.',
      'PASSPORT_ADVANCED_DRIVE_REQUIRED',
      400,
      { recommendedFix: 'Apps Script → Services bo‘limida Drive API v3 ni yoqing, so‘ng /exec deploymentni yangi versiya bilan qayta deploy qiling.' },
    );
  }
  return error;
}

function diagnosticHost(value) {
  try { return new URL(value).hostname; } catch (_) { return ''; }
}
function diagnosticCode(value) {
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(String(value || '')) ? String(value) : 'UNKNOWN';
}
const SAFE_RETRY_ACTIONS = new Set(['passport_capabilities', 'validate_folder', 'ensure_subfolder', 'save_passport_pdf']);
const TRANSIENT_REQUEST_ERRORS = new Set(['DRIVE_APPS_SCRIPT_TIMEOUT', 'DRIVE_APPS_SCRIPT_REDIRECT_FAILED', 'DRIVE_APPS_SCRIPT_INVALID_RESPONSE', 'DRIVE_UPLOAD_FAILED']);
const DIAGNOSTIC_ACTIONS = new Set(['validate_folder', 'ensure_subfolder', 'upload_pdf_base64', 'passport_capabilities', 'save_passport_pdf']);

export class AppsScriptPersonalDriveProvider {
  constructor({ url, secret, fetchImpl = globalThis.fetch, timeoutMs = 30000, maxRequestAttempts = 3, retryDelayMs = 500, diagnosticsLogger = entry => console.info('[apps-script-drive]', JSON.stringify(entry)) }) {
    this.url = clean(url);
    this.secret = clean(secret);
    this.fetchImpl = fetchImpl;
    this.maxRequestAttempts = Math.min(3, Math.max(1, Number(maxRequestAttempts) || 1));
    this.retryDelayMs = Math.min(2000, Math.max(0, Number(retryDelayMs) || 0));
    this.diagnosticsLogger = diagnosticsLogger;
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
    const attempts = SAFE_RETRY_ACTIONS.has(action) ? this.maxRequestAttempts : 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try { return await this.requestOnce(action, payload, attempt); }
      catch (error) {
        if (attempt === attempts || !TRANSIENT_REQUEST_ERRORS.has(error.code)) throw error;
        await new Promise(resolve => setTimeout(resolve, this.retryDelayMs * attempt));
      }
    }
  }

  async requestOnce(action, payload = {}, attempt = 1) {
    const timestamp = Date.now();
    const nonce = crypto.randomUUID();
    const envelope = { action, payload, timestamp, nonce };
    const signature = signAppsScriptRequest(envelope, this.secret);
    const requestBody = JSON.stringify({ ...envelope, signature });
    const startedAt = Date.now();
    const diagnostic = {
      requestId: nonce,
      attempt,
      action: DIAGNOSTIC_ACTIONS.has(action) ? action : 'other',
      requestHost: diagnosticHost(this.url),
      requestBytes: Buffer.byteLength(requestBody),
      httpStatus: null,
      responseHost: '',
      redirected: false,
      responseType: '',
      responseFormat: 'unavailable',
      outcome: 'error',
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: requestBody,
        redirect: 'follow',
        signal: controller.signal,
      });
      diagnostic.httpStatus = response.status;
      diagnostic.responseHost = diagnosticHost(response.url || this.url);
      diagnostic.redirected = Boolean(response.redirected);
      const mimeType = clean(response.headers?.get?.('content-type')).split(';')[0].toLowerCase();
      diagnostic.responseType = ['application/json', 'text/html', 'text/plain'].includes(mimeType) ? mimeType : 'other';
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; diagnostic.responseFormat = text ? 'json' : 'empty'; } catch (_) {
        diagnostic.responseFormat = 'non-json';
        if (response.status === 404 && response.redirected === true
          && diagnostic.responseHost === 'script.googleusercontent.com'
          && SAFE_RETRY_ACTIONS.has(action)) {
          // The Apps Script entrypoint ran, but its redirected response was unavailable.
          // Durable workers retry these actions; legacy uploads are excluded because they create new files.
          throw providerError(
            'Google Apps Script javobini olishda vaqtinchalik xato yuz berdi.',
            'DRIVE_APPS_SCRIPT_REDIRECT_FAILED',
            502,
          );
        }
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
      diagnostic.outcome = 'success';
      return data;
    } catch (error) {
      const classified = classifyAppsScriptDriveError(error);
      diagnostic.errorCode = diagnosticCode(classified.code);
      classified.driveRequestId = nonce;
      classified.driveRequestAction = diagnostic.action;
      throw classified;
    } finally {
      clearTimeout(timer);
      diagnostic.durationMs = Date.now() - startedAt;
      // Never log payloads, signatures, secrets, full URLs, response bodies or remote messages.
      try { this.diagnosticsLogger?.(diagnostic); } catch (_) { /* Logging cannot change a Drive operation. */ }
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

  async passportCapabilities() {
    try { return await this.request('passport_capabilities', {}); }
    catch (error) { throw classifyPassportAdapterError(error); }
  }

  async savePassportPdf(targetFolderId, name, value, operationKey) {
    const bytes = Buffer.from(value || []);
    if (!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))) throw providerError('Haqiqiy PDF talab qilinadi.', 'DRIVE_PDF_SIGNATURE_INVALID');
    let result;
    try {
      result = await this.request('save_passport_pdf', {targetFolderId,name,operationKey,pdfBase64:bytes.toString('base64')});
    } catch(error) {
      throw classifyPassportAdapterError(error);
    }
    if (!result.fileId || Number(result.size) !== bytes.length || result.parentFolderId !== targetFolderId) throw providerError('Drive PDF yozuvi tasdiqlanmadi.', 'DRIVE_UPLOAD_RESULT_INVALID', 502);
    return {fileId:result.fileId,url:result.url || `https://drive.google.com/file/d/${result.fileId}/view`,size:Number(result.size)};
  }

  async uploadPdf(targetFolderId, name, value) {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || '');
    if (!buffer.length) {
      throw providerError('PDF buffer bo\u2018sh.', 'DRIVE_PDF_BYTES_EMPTY', 400);
    }
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-', 'ascii'))) {
      throw providerError('Yuklanayotgan fayl haqiqiy PDF emas.', 'DRIVE_PDF_SIGNATURE_INVALID', 400);
    }
    const result = await this.request('upload_pdf_base64', {
      targetFolderId: clean(targetFolderId),
      name: clean(name),
      mimeType: 'application/pdf',
      pdfBase64: buffer.toString('base64'),
    });
    const fileId = clean(result.fileId);
    const size = Number(result.size || 0);
    const parentFolderId = clean(result.parentFolderId) || clean(targetFolderId);
    if (!fileId || !size || parentFolderId !== clean(targetFolderId)) {
      throw providerError(
        'Apps Script PDF yukladi, lekin tasdiqlangan fileId, size yoki parent papkani qaytarmadi.',
        'DRIVE_UPLOAD_RESULT_INVALID',
        502,
      );
    }
    return {
      fileId,
      url: clean(result.url),
      size,
      createdAt: clean(result.createdAt),
      parentFolderId,
    };
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
