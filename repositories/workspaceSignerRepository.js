import { query } from '../db/pool.js';

let signerSchemaReady = false;

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
  await query("ALTER TABLE signers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'");
  await query('ALTER TABLE signers ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id)');
  await query('ALTER TABLE signers ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id)');
  await query('ALTER TABLE signers ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT NOW()');
  await query('ALTER TABLE signers ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT NOW()');
  await query(`CREATE INDEX IF NOT EXISTS idx_signers_workspace_status
    ON signers (workspace_id, status, created_at DESC)`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_signers_workspace_email_active
    ON signers (workspace_id, lower(email))
    WHERE status <> 'deleted' AND workspace_id IS NOT NULL AND email <> ''`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_signers_workspace_name_position_active
    ON signers (workspace_id, lower(full_name), lower(position))
    WHERE status <> 'deleted' AND workspace_id IS NOT NULL AND full_name <> '' AND position <> ''`);
  signerSchemaReady = true;
}

function mapSigner(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    position: row.position || '',
    fullName: row.full_name || '',
    email: row.email || '',
    signatureFileId: row.signature_file_id || '',
    signatureUrl: row.signature_url || '',
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
            signature_url, status, created_by, updated_by, created_at, updated_at
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
            signature_url, status, created_by, updated_by, created_at, updated_at
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
        status, created_by, updated_by)
     VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), $7, $8, $8)
     RETURNING id, workspace_id, position, full_name, email, signature_file_id,
               signature_url, status, created_by, updated_by, created_at, updated_at`,
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
         status = COALESCE($8, status),
         updated_by = $9,
         updated_at = NOW()
     WHERE workspace_id = $1 AND id = $2 AND status <> 'deleted'
     RETURNING id, workspace_id, position, full_name, email, signature_file_id,
               signature_url, status, created_by, updated_by, created_at, updated_at`,
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
               signature_url, status, created_by, updated_by, created_at, updated_at`,
    [workspaceId, signerId, actorUserId],
  );
  return mapSigner(result.rows[0]);
}
