import { query } from '../db/pool.js';

let signatureStoreReady = false;

async function ensureWorkspaceSignatureStore() {
  if (signatureStoreReady) return;
  await query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await query(`CREATE TABLE IF NOT EXISTS workspace_signature_store (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    file_name text NOT NULL DEFAULT 'signature.png',
    mime_type text NOT NULL DEFAULT 'image/png',
    image_base64 text NOT NULL,
    image_sha256 text NOT NULL,
    size_bytes integer NOT NULL DEFAULT 0,
    created_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_workspace_signature_store_workspace_created
    ON workspace_signature_store (workspace_id, created_at DESC)`);
  signatureStoreReady = true;
}

function mapSignature(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    fileName: row.file_name || 'signature.png',
    mimeType: row.mime_type || 'image/png',
    imageBase64: row.image_base64 || '',
    imageSha256: row.image_sha256 || '',
    sizeBytes: row.size_bytes || 0,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
  };
}

export async function saveWorkspaceSignatureImage(workspaceId, input) {
  await ensureWorkspaceSignatureStore();
  const result = await query(
    `INSERT INTO workspace_signature_store
       (workspace_id, file_name, mime_type, image_base64, image_sha256, size_bytes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, workspace_id, file_name, mime_type, image_base64, image_sha256, size_bytes, created_by, created_at`,
    [
      workspaceId,
      input.fileName || 'signature.png',
      input.mimeType || 'image/png',
      input.imageBase64,
      input.imageSha256,
      input.sizeBytes || 0,
      input.createdBy || null,
    ],
  );
  return mapSignature(result.rows[0]);
}

export async function getWorkspaceSignatureImage(workspaceId, signatureId) {
  await ensureWorkspaceSignatureStore();
  const result = await query(
    `SELECT id, workspace_id, file_name, mime_type, image_base64, image_sha256, size_bytes, created_by, created_at
     FROM workspace_signature_store
     WHERE workspace_id = $1 AND id = $2
     LIMIT 1`,
    [workspaceId, signatureId],
  );
  return mapSignature(result.rows[0]);
}
