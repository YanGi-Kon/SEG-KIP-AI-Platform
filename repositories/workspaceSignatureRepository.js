import { query } from '../db/pool.js';

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
      input.sizeBytes,
      input.createdBy || null,
    ],
  );
  return mapSignature(result.rows[0]);
}

export async function getWorkspaceSignatureImage(workspaceId, signatureId) {
  const result = await query(
    `SELECT id, workspace_id, file_name, mime_type, image_base64, image_sha256, size_bytes, created_by, created_at
     FROM workspace_signature_store
     WHERE workspace_id = $1 AND id = $2
     LIMIT 1`,
    [workspaceId, signatureId],
  );
  return mapSignature(result.rows[0]);
}
