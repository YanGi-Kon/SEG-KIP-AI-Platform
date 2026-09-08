import dotenv from 'dotenv';
import { closePool, getPool } from '../db/pool.js';
import { getAppConfig } from '../config/env.js';

dotenv.config();

const errors = [];
const warnings = [];
const ok = [];

function value(name) {
  return String(process.env[name] || '').trim();
}

function isTrue(name) {
  return ['1', 'true', 'yes', 'on'].includes(value(name).toLowerCase());
}

function isPlaceholder(secret) {
  return !secret || /^replace-with-/i.test(secret) || /YOUR_[A-Z0-9_]+/i.test(secret);
}

function urlHost(raw) {
  try {
    return new URL(raw).host;
  } catch (_) {
    return '';
  }
}

const nodeEnv = value('NODE_ENV') || 'development';
const port = value('PORT') || '3000';
const workspaceMode = isTrue('WORKSPACE_MODE_ENABLED');
const databaseUrl = value('DATABASE_URL');
const googleJson = value('GOOGLE_SERVICE_ACCOUNT_JSON');
const googleBase64 = value('GOOGLE_SERVICE_ACCOUNT_BASE64');
const publicBaseUrl = value('PUBLIC_BASE_URL');
const corsOrigins = value('CORS_ALLOWED_ORIGINS');

if (nodeEnv !== 'development') warnings.push(`NODE_ENV=${nodeEnv}. Local tekshiruv uchun development tavsiya etiladi.`);
if (port !== '3001') warnings.push(`PORT=${port}. Ushbu loyiha localhost testida 3001 ishlatilmoqda.`);
else ok.push('PORT=3001');

if (!workspaceMode) errors.push('WORKSPACE_MODE_ENABLED=true bo‘lishi kerak; aks holda /api/auth/login 404 qaytaradi.');
else ok.push('Workspace mode yoqilgan');

if (!databaseUrl) errors.push('DATABASE_URL bo‘sh.');
if (!googleJson && !googleBase64) errors.push('GOOGLE_SERVICE_ACCOUNT_JSON yoki GOOGLE_SERVICE_ACCOUNT_BASE64 dan bittasi kerak.');
else ok.push('Google Service Account mavjud');

for (const name of ['ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET', 'APPROVAL_JWT_SECRET']) {
  const secret = value(name);
  if (workspaceMode && isPlaceholder(secret)) warnings.push(`${name} bo‘sh yoki placeholder qiymatda.`);
}

if (nodeEnv === 'development') {
  if (publicBaseUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(publicBaseUrl)) {
    warnings.push(`PUBLIC_BASE_URL localhost emas: ${publicBaseUrl}`);
  }
  if (corsOrigins && !/(localhost|127\.0\.0\.1)/i.test(corsOrigins)) {
    warnings.push('CORS_ALLOWED_ORIGINS ichida localhost ko‘rinmadi.');
  }
}

const templateNeonHost = 'ep-dry-cake-asxa7gj7-pooler.c-4.eu-central-1.aws.neon.tech';
if (databaseUrl && urlHost(databaseUrl).includes(templateNeonHost)) {
  errors.push('DATABASE_URL eski .env.example dagi Neon manziliga qarayapti. Uni dev/staging DB connection string bilan almashtiring.');
}

let config = null;
try {
  config = getAppConfig();
  ok.push('config/env.js validatsiyasidan o‘tdi');
} catch (error) {
  errors.push(`Config validatsiya: ${error.message}`);
}

if (config?.database?.url) {
  try {
    const pool = getPool();
    const identity = await pool.query(`
      SELECT current_database() AS database,
             current_setting('transaction_read_only') AS read_only,
             to_regclass('public.schema_migrations') AS migrations_table,
             to_regclass('public.to_periods') AS to_periods_table
    `);
    const row = identity.rows[0] || {};
    ok.push(`DB ulandi: ${row.database || 'unknown'} (${urlHost(databaseUrl) || 'host unknown'})`);
    if (row.read_only === 'on') warnings.push('DB transaction_read_only=on; TO oy yaratish yozuvlari ishlamaydi.');

    if (!row.migrations_table) {
      warnings.push('schema_migrations jadvali yo‘q; bu baza hali loyiha migratsiyalariga tayyorlanmagan.');
    } else {
      const migration = await pool.query(
        `SELECT filename FROM schema_migrations WHERE filename = '031_to_periods.sql' LIMIT 1`,
      );
      if (!migration.rows.length) warnings.push('031_to_periods.sql hali qo‘llanmagan; yangi TO oylik funksiyasi ishlamaydi.');
      else ok.push('031_to_periods.sql qo‘llangan');
    }

    if (!row.to_periods_table) warnings.push('to_periods jadvali topilmadi.');
    else ok.push('to_periods jadvali mavjud');
  } catch (error) {
    errors.push(`DB tekshiruvi: ${error.message}`);
  } finally {
    await closePool().catch(() => {});
  }
}

console.log('\nSEG-KIP local development doctor');
console.log('================================');
for (const item of ok) console.log(`OK   ${item}`);
for (const item of warnings) console.log(`WARN ${item}`);
for (const item of errors) console.log(`ERR  ${item}`);
console.log('================================');
console.log(errors.length ? `Natija: ${errors.length} ta kritik muammo.` : 'Natija: kritik muammo topilmadi.');

if (errors.length) process.exitCode = 1;
