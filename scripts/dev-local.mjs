import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
dotenv.config({ path: path.join(projectDir, '.env') });

// This launcher deliberately replaces the configured database and integration credentials
// for this process only. It never reads or writes the configured remote database.
process.env.LOCAL_DEV_PGLITE = 'true';
process.env.PGLITE_DATA_DIR = path.resolve(
  process.env.LOCAL_DEV_DATA_DIR || path.join(projectDir, 'data', 'local-dev-pglite'),
);
process.env.DATABASE_URL = 'pglite://local-development';
process.env.NODE_ENV = 'development';
process.env.PORT = String(process.env.LOCAL_DEV_PORT || '3001');
process.env.WORKSPACE_MODE_ENABLED = 'true';
process.env.LEGACY_CONFIG_ENABLED = 'false';
process.env.AUTH_REQUIRED = 'true';
process.env.DB_AUTO_MIGRATE = 'true';
process.env.DEFAULT_WORKSPACE_BOOTSTRAP = 'false';
process.env.OUTBOX_WORKER_ENABLED = 'false';
process.env.BACKUP_WORKER_ENABLED = 'false';
process.env.PASSPORT_WORKER_ENABLED = 'false';
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = '';
process.env.GOOGLE_SERVICE_ACCOUNT_BASE64 = '';
process.env.GOOGLE_SPREADSHEET_URL = '';
process.env.GOOGLE_SHEETS_ID = '';
process.env.SIGNATURE_DRIVE_FOLDER_ID = '';
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.TELEGRAM_BACKUP_CHAT_ID = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.OPENAI_API_KEY = '';

for (const key of ['ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET', 'APPROVAL_JWT_SECRET', 'WORKSPACE_ENCRYPTION_KEY', 'ADMIN_JWT_SECRET']) {
  process.env[key] = crypto.randomBytes(32).toString('hex');
}

const { runMigrations } = await import('../db/migrate.js');
const { query, withTransaction } = await import('../db/pool.js');
const { hashPassword } = await import('../services/passwordService.js');

const localEmail = 'local.admin@example.test';
const localWorkspaceSlug = 'local-dev-workspace';
const credentialsPath = path.resolve(
  process.env.LOCAL_DEV_CREDENTIALS_PATH || path.join(projectDir, 'tmp', 'local-dev-credentials.txt'),
);

function newLocalPassword() {
  return `Local-${crypto.randomBytes(18).toString('base64url')}!`;
}

async function readSavedPassword() {
  try {
    const content = await fs.readFile(credentialsPath, 'utf8');
    const match = content.match(/^password=(.+)$/m);
    return match?.[1] || '';
  } catch (_) {
    return '';
  }
}

async function prepareLocalAccount() {
  await fs.mkdir(path.dirname(credentialsPath), { recursive: true });
  const existing = await query('SELECT id FROM users WHERE email = $1', [localEmail]);
  let userId = existing.rows[0]?.id;
  let password = await readSavedPassword();

  if (!userId) {
    password = newLocalPassword();
    const passwordHash = await hashPassword(password);
    const created = await query(
      `INSERT INTO users (full_name, email, password_hash, platform_role, status)
       VALUES ($1, $2, $3, 'super_admin', 'active')
       RETURNING id`,
      ['Local Development Admin', localEmail, passwordHash],
    );
    userId = created.rows[0].id;
  } else {
    await query("UPDATE users SET platform_role = 'super_admin', status = 'active' WHERE id = $1", [userId]);
    if (!password) {
      password = newLocalPassword();
      const passwordHash = await hashPassword(password);
      await query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash]);
    }
  }

  const workspaceResult = await query('SELECT id FROM workspaces WHERE slug = $1', [localWorkspaceSlug]);
  let workspaceId = workspaceResult.rows[0]?.id;
  if (!workspaceId) {
    await withTransaction(async (client) => {
      const created = await client.query(
        `INSERT INTO workspaces
           (owner_id, name, slug, spreadsheet_id, spreadsheet_url, status, is_default, time_zone, module_settings)
         VALUES ($1, 'Local Development Workspace', $2, 'LOCAL_DEV_ONLY_SPREADSHEET_ID_0000000000000000',
           'https://docs.google.com/spreadsheets/d/LOCAL_DEV_ONLY_SPREADSHEET_ID_0000000000000000/edit',
           'active', true, 'Asia/Tashkent', '{}'::jsonb)
         RETURNING id`,
        [userId, localWorkspaceSlug],
      );
      workspaceId = created.rows[0].id;
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role, status)
         VALUES ($1, $2, 'owner', 'active')
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner', status = 'active'`,
        [workspaceId, userId],
      );
    });
  } else {
    await query("UPDATE workspaces SET status = 'active', is_default = true WHERE id = $1", [workspaceId]);
    await query(
      `INSERT INTO workspace_members (workspace_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active')
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner', status = 'active'`,
      [workspaceId, userId],
    );
  }

  await fs.writeFile(
    credentialsPath,
    `LOCAL DEVELOPMENT ONLY — this account exists only in the isolated local PGlite database.\nemail=${localEmail}\npassword=${password}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  console.log(`[local-dev] Local login account prepared: ${localEmail}`);
  console.log(`[local-dev] Local credentials: ${credentialsPath}`);
}

try {
  const migrationReport = await runMigrations();
  console.log(`[local-dev] Local PGlite migrations: ${migrationReport.applied.length} applied, ${migrationReport.skipped.length} already current.`);
  await prepareLocalAccount();
  await import('../server.js');
} catch (error) {
  console.error('[local-dev] Startup failed:', error.message);
  process.exitCode = 1;
}
