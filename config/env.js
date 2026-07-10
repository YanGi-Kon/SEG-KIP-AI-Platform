const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off', '']);

export function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw new Error(`Invalid boolean environment value: ${value}`);
}

export function parseCsv(value = '') {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function requireMinimumSecret(value, name, enabled, minimum = 32) {
  const secret = String(value || '').trim();
  if (enabled && secret.length < minimum) {
    throw new Error(`${name} must contain at least ${minimum} characters`);
  }
  return secret;
}

export function getAppConfig(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || 'development').trim().toLowerCase();
  const isProduction = nodeEnv === 'production';

  const features = Object.freeze({
    workspaceModeEnabled: parseBoolean(env.WORKSPACE_MODE_ENABLED, false),
    legacyConfigEnabled: parseBoolean(env.LEGACY_CONFIG_ENABLED, true),
    authRequired: parseBoolean(env.AUTH_REQUIRED, false),
    outboxWorkerEnabled: parseBoolean(env.OUTBOX_WORKER_ENABLED, false),
  });

  const databaseUrl = String(env.DATABASE_URL || '').trim();
  if (features.workspaceModeEnabled && !databaseUrl) {
    throw new Error('DATABASE_URL is required when WORKSPACE_MODE_ENABLED=true');
  }

  const authSecretsRequired = features.authRequired || (isProduction && features.workspaceModeEnabled);

  const config = {
    nodeEnv,
    isProduction,
    port: parsePositiveInteger(env.PORT, 3000, 'PORT'),
    publicBaseUrl: String(env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, ''),
    timeZone: String(env.APP_TIME_ZONE || 'Asia/Tashkent').trim(),
    cors: Object.freeze({
      origins: parseCsv(env.CORS_ALLOWED_ORIGINS),
    }),
    features,
    database: Object.freeze({
      url: databaseUrl,
      ssl: parseBoolean(env.DATABASE_SSL, false),
      maxConnections: parsePositiveInteger(env.DATABASE_POOL_MAX, 10, 'DATABASE_POOL_MAX'),
      idleTimeoutMs: parsePositiveInteger(env.DATABASE_IDLE_TIMEOUT_MS, 30000, 'DATABASE_IDLE_TIMEOUT_MS'),
      connectionTimeoutMs: parsePositiveInteger(env.DATABASE_CONNECTION_TIMEOUT_MS, 10000, 'DATABASE_CONNECTION_TIMEOUT_MS'),
      statementTimeoutMs: parsePositiveInteger(env.DATABASE_STATEMENT_TIMEOUT_MS, 30000, 'DATABASE_STATEMENT_TIMEOUT_MS'),
    }),
    secrets: Object.freeze({
      accessToken: requireMinimumSecret(env.ACCESS_TOKEN_SECRET, 'ACCESS_TOKEN_SECRET', authSecretsRequired),
      refreshToken: requireMinimumSecret(env.REFRESH_TOKEN_SECRET, 'REFRESH_TOKEN_SECRET', authSecretsRequired),
      approvalJwt: requireMinimumSecret(env.APPROVAL_JWT_SECRET, 'APPROVAL_JWT_SECRET', features.workspaceModeEnabled),
      workspaceEncryption: requireMinimumSecret(env.WORKSPACE_ENCRYPTION_KEY, 'WORKSPACE_ENCRYPTION_KEY', false),
      adminJwt: String(env.ADMIN_JWT_SECRET || '').trim(),
    }),
    google: Object.freeze({
      serviceAccountJson: String(env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim(),
      serviceAccountBase64: String(env.GOOGLE_SERVICE_ACCOUNT_BASE64 || '').trim(),
      legacySpreadsheetUrl: String(env.GOOGLE_SPREADSHEET_URL || env.GOOGLE_SHEETS_ID || '').trim(),
      legacySignatureFolderId: String(env.SIGNATURE_DRIVE_FOLDER_ID || '').trim(),
    }),
  };

  if (features.workspaceModeEnabled && !config.google.serviceAccountJson && !config.google.serviceAccountBase64) {
    throw new Error('A platform Google Service Account is required when WORKSPACE_MODE_ENABLED=true');
  }

  return Object.freeze(config);
}

export function redactConfig(config) {
  return {
    nodeEnv: config.nodeEnv,
    isProduction: config.isProduction,
    port: config.port,
    publicBaseUrl: config.publicBaseUrl,
    timeZone: config.timeZone,
    cors: config.cors,
    features: config.features,
    database: {
      configured: Boolean(config.database.url),
      ssl: config.database.ssl,
      maxConnections: config.database.maxConnections,
      idleTimeoutMs: config.database.idleTimeoutMs,
      connectionTimeoutMs: config.database.connectionTimeoutMs,
      statementTimeoutMs: config.database.statementTimeoutMs,
    },
    secrets: {
      accessTokenConfigured: Boolean(config.secrets.accessToken),
      refreshTokenConfigured: Boolean(config.secrets.refreshToken),
      approvalJwtConfigured: Boolean(config.secrets.approvalJwt),
      workspaceEncryptionConfigured: Boolean(config.secrets.workspaceEncryption),
      adminJwtConfigured: Boolean(config.secrets.adminJwt),
    },
    google: {
      serviceAccountConfigured: Boolean(config.google.serviceAccountJson || config.google.serviceAccountBase64),
      legacySpreadsheetConfigured: Boolean(config.google.legacySpreadsheetUrl),
      legacySignatureFolderConfigured: Boolean(config.google.legacySignatureFolderId),
    },
  };
}
