import { query } from '../db/pool.js';

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
  const result = await query(
    `SELECT id, workspace_id, position, full_name, email, signature_file_id,
            signature_url, status, created_by, updated_by, created_at, updated_at
     FROM workspace_signers
     WHERE workspace_id = $1::uuid
       AND status <> 'deleted'
       AND ($2::boolean OR status = 'active')
     ORDER BY CASE status WHEN 'active' THEN 1 WHEN 'inactive' THEN 2 ELSE 3 END,
              position ASC, full_name ASC`,
    [workspaceId, Boolean(includeInactive)],
  );
  return result.rows.map(mapSigner);
}

export async function getWorkspaceSigner(workspaceId, signerId) {
  const result = await query(
    `SELECT id, workspace_id, position, full_name, email, signature_file_id,
            signature_url, status, created_by, updated_by, created_at, updated_at
     FROM workspace_signers
     WHERE workspace_id = $1::uuid AND id = $2::uuid AND status <> 'deleted'
     LIMIT 1`,
    [workspaceId, signerId],
  );
  return mapSigner(result.rows[0]);
}

export async function createWorkspaceSigner(workspaceId, input) {
  const result = await query(
    `INSERT INTO workspace_signers
       (workspace_id, position, full_name, email, signature_file_id, signature_url,
        status, created_by, updated_by)
     VALUES ($1::uuid, $2::text, $3::text, lower($4::text), NULLIF($5::text, ''), NULLIF($6::text, ''),
             $7::text, $8::uuid, $8::uuid)
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
  const result = await query(
    `UPDATE workspace_signers
     SET position = COALESCE($3::text, position),
         full_name = COALESCE($4::text, full_name),
         email = COALESCE(lower($5::text), email),
         signature_file_id = CASE WHEN $6::text IS NULL THEN signature_file_id ELSE NULLIF($6::text, '') END,
         signature_url = CASE WHEN $7::text IS NULL THEN signature_url ELSE NULLIF($7::text, '') END,
         status = COALESCE($8::text, status),
         updated_by = $9::uuid,
         updated_at = NOW()
     WHERE workspace_id = $1::uuid AND id = $2::uuid AND status <> 'deleted'
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
  const result = await query(
    `UPDATE workspace_signers
     SET status = 'deleted', updated_by = $3::uuid, updated_at = NOW()
     WHERE workspace_id = $1::uuid AND id = $2::uuid AND status <> 'deleted'
     RETURNING id, workspace_id, position, full_name, email, signature_file_id,
               signature_url, status, created_by, updated_by, created_at, updated_at`,
    [workspaceId, signerId, actorUserId],
  );
  return mapSigner(result.rows[0]);
}
