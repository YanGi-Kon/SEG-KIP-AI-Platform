import { query } from '../db/pool.js';

let signerSchemaReady = false;

async function trySchemaQuery(sql) {
  try {
    await query(sql);
  } catch (_) {
    // Optional self-heal indexes may fail when legacy duplicate rows exist.
    // CRUD still works and service-level duplicate handling remains active where indexes exist.
  }
}

async function ensureWorkspaceSignersSchema() {
  if (signerSchemaReady) return;
  await query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await query(`CREATE TABLE IF NOT EXISTS signers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
    position text NOT NULL DEFAULT '',
    full_name text NOT NULL DEFAULT '',
    email text NOT NULL DEFAULT '',
    signature_file_id text,
    signature_url text,
    lavozimi text NOT NULL DEFAULT '',
    fio text NOT NULL DEFAULT '',
    gmail text NOT NULL DEFAULT '',
    imzo_png text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'active',
    created_by uuid REFERENCES users(id),
    updated_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW()
  )`);
  await query('ALTER TABLE signers ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE');
  await query("ALTER TABLE signers ADD COLUMN IF NOT EXISTS position text NOT NULL DEFAULT ''");
  await query("ALTER TABLE signers ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT ''");
  await query("ALTER TABLE signers ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT ''");
  await query('ALTER TABLE signers ADD COLUMN IF NOT EXISTS signature_file_id text');
  await query('ALTER TABLE signers ADD COLUMN IF NOT EXISTS signature_url text');
  await query("ALTER TABLE signers ADD COLUMN IF NOT EXISTS lavozimi text NOT NULL DEFAULT ''");
  await query("ALTER TABLE signers ADD COLUMN IF NOT EXISTS fio text NOT NULL DEFAULT ''");
  await query("ALTER TABLE signers ADD COLUMN IF NOT EXISTS gmail text NOT NULL DEFAULT ''");
  await query("ALTER TABLE signers ADD COLUMN IF NOT EXISTS imzo_png text NOT NULL DEFAULT ''");
  await query("ALTER TABLE signers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'");
  await query('ALTER TABLE signers ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id)');
  await query('ALTER TABLE signers ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id)');
  await query('ALTER TABLE signers ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT NOW()');
  await query('ALTER TABLE signers ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT NOW()');
  await query("ALTER TABLE signers ALTER COLUMN position SET DEFAULT ''");
  await query("ALTER TABLE signers ALTER COLUMN full_name SET DEFAULT ''");
  await query("ALTER TABLE signers ALTER COLUMN email SET DEFAULT ''");
  await query("ALTER TABLE signers ALTER COLUMN lavozimi SET DEFAULT ''");
  await query("ALTER TABLE signers ALTER COLUMN fio SET DEFAULT ''");
  await query("ALTER TABLE signers ALTER COLUMN gmail SET DEFAULT ''");
  await query("ALTER TABLE signers ALTER COLUMN imzo_png SET DEFAULT ''");
  await query("UPDATE signers SET position = COALESCE(NULLIF(position, ''), lavozimi, '') WHERE position IS NULL OR position = ''");
  await query("UPDATE signers SET full_name = COALESCE(NULLIF(full_name, ''), fio, '') WHERE full_name IS NULL OR full_name = ''");
  await query("UPDATE signers SET email = COALESCE(NULLIF(email, ''), gmail, '') WHERE email IS NULL OR email = ''");
  await query("UPDATE signers SET signature_url = COALESCE(NULLIF(signature_url, ''), imzo_png, '') WHERE signature_url IS NULL OR signature_url = ''");
  await trySchemaQuery(`CREATE INDEX IF NOT EXISTS idx_signers_workspace_status
    ON signers (workspace_id, status, created_at DESC)`);
  await trySchemaQuery(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_signers_workspace_email_active
    ON signers (workspace_id, lower(email))
    WHERE status <> 'deleted' AND workspace_id IS NOT NULL AND email <> ''`);
  await trySchemaQuery(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_signers_workspace_name_position_active
    ON signers (workspace_id, lower(full_name), lower(position))
    WHERE status <> 'deleted' AND workspace_id IS NOT NULL AND full_name <> '' AND position <> ''`);
  signerSchemaReady = true;
}

function mapSigner(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    position: row.position || row.lavozimi || '',
    fullName: row.full_name || row.fio || '',
    email: row.email || row.gmail || '',
    signatureFileId: row.signature_file_id || '',
    signatureUrl: row.signature_url || row.imzo_png || '',
    status: row.status || 'active',
    createdBy: row.created_by || null,
    updatedBy: row.updated_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listWorkspaceSigners(workspaceId, { includeInactive = false } = {}) {
  await ensureWorkspaceSignersSchema();
  const result = await query(
    `SELECT id, workspace_id, position, full_name, email, signature_file_id,
            signature_url, lavozimi, fio, gmail, imzo_png, status,
            created_by, updated_by, created_at, updated_at
     FROM signers
     WHERE workspace_id = $1
       AND status <> 'deleted'
       AND ($2::boolean OR status = 'active')
     ORDER BY CASE status WHEN 'active' THEN 1 WHEN 'inactive' THEN 2 ELSE 3 END,
              position ASC, full_name ASC`,
    [workspaceId, Boolean(includeInactive)],
  );
  return result.rows.map(mapSigner);
}

export async function getWorkspaceSigner(workspaceId, signerId) {
  await ensureWorkspaceSignersSchema();
  const result = await query(
    `SELECT id, workspace_id, position, full_name, email, signature_file_id,
            signature_url, lavozimi, fio, gmail, imzo_png, status,
            created_by, updated_by, created_at, updated_at
     FROM signers
     WHERE workspace_id = $1 AND id = $2 AND status <> 'deleted'
     LIMIT 1`,
    [workspaceId, signerId],
  );
  return mapSigner(result.rows[0]);
}

export async function createWorkspaceSigner(workspaceId, input) {
  await ensureWorkspaceSignersSchema();
  const result = await query(
    `INSERT INTO signers
       (workspace_id, position, full_name, email, signature_file_id, signature_url,
        lavozimi, fio, gmail, imzo_png, status, created_by, updated_by)
     VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''),
             $2, $3, $4, $6, $7, $8, $8)
     RETURNING id, workspace_id, position, full_name, email, signature_file_id,
               signature_url, lavozimi, fio, gmail, imzo_png, status,
               created_by, updated_by, created_at, updated_at`,
    [
      workspaceId,
      input.position,
      input.fullName,
      input.email,
      input.signatureFileId || '',
      input.signatureUrl || '',
      input.status || 'active',
      input.actorUserId || null,
    ],
  );
  return mapSigner(result.rows[0]);
}

export async function updateWorkspaceSigner(workspaceId, signerId, input) {
  await ensureWorkspaceSignersSchema();
  const result = await query(
    `UPDATE signers
     SET position = COALESCE($3, position),
         full_name = COALESCE($4, full_name),
         email = COALESCE($5, email),
         signature_file_id = CASE WHEN $6::text IS NULL THEN signature_file_id ELSE NULLIF($6, '') END,
         signature_url = CASE WHEN $7::text IS NULL THEN signature_url ELSE NULLIF($7, '') END,
         lavozimi = COALESCE($3, lavozimi),
         fio = COALESCE($4, fio),
         gmail = COALESCE($5, gmail),
         imzo_png = CASE WHEN $7::text IS NULL THEN imzo_png ELSE COALESCE($7, '') END,
         status = COALESCE($8, status),
         updated_by = $9,
         updated_at = NOW()
     WHERE workspace_id = $1 AND id = $2 AND status <> 'deleted'
     RETURNING id, workspace_id, position, full_name, email, signature_file_id,
               signature_url, lavozimi, fio, gmail, imzo_png, status,
               created_by, updated_by, created_at, updated_at`,
    [
      workspaceId,
      signerId,
      input.position ?? null,
      input.fullName ?? null,
      input.email ?? null,
      input.signatureFileId === undefined ? null : input.signatureFileId,
      input.signatureUrl === undefined ? null : input.signatureUrl,
      input.status ?? null,
      input.actorUserId || null,
    ],
  );
  return mapSigner(result.rows[0]);
}

export async function deleteWorkspaceSigner(workspaceId, signerId, actorUserId = null) {
  await ensureWorkspaceSignersSchema();
  const result = await query(
    `UPDATE signers
     SET status = 'deleted', updated_by = $3, updated_at = NOW()
     WHERE workspace_id = $1 AND id = $2 AND status <> 'deleted'
     RETURNING id, workspace_id, position, full_name, email, signature_file_id,
               signature_url, lavozimi, fio, gmail, imzo_png, status,
               created_by, updated_by, created_at, updated_at`,
    [workspaceId, signerId, actorUserId],
  );
  return mapSigner(result.rows[0]);
}
