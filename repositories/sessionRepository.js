import { query } from '../db/pool.js';

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    familyId: row.family_id,
    userAgent: row.user_agent,
    ipAddress: row.ip_address,
    expiresAt: row.expires_at,
    rotatedAt: row.rotated_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

export async function createRefreshSession(input, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `INSERT INTO refresh_sessions
       (user_id, token_hash, family_id, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, token_hash, family_id, user_agent, ip_address,
               expires_at, rotated_at, revoked_at, created_at`,
    [
      input.userId,
      input.tokenHash,
      input.familyId,
      input.userAgent || null,
      input.ipAddress || null,
      input.expiresAt,
    ],
  );
  return mapSession(result.rows[0]);
}

export async function findRefreshSessionByHash(tokenHash, { forUpdate = false, client = null } = {}) {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT id, user_id, token_hash, family_id, user_agent, ip_address,
            expires_at, rotated_at, revoked_at, created_at
     FROM refresh_sessions
     WHERE token_hash = $1
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [tokenHash],
  );
  return mapSession(result.rows[0]);
}

export async function rotateRefreshSession(id, rotatedAt = new Date(), client = null) {
  const executor = client || { query };
  await executor.query(
    `UPDATE refresh_sessions
     SET rotated_at = $2
     WHERE id = $1 AND rotated_at IS NULL AND revoked_at IS NULL`,
    [id, rotatedAt],
  );
}

export async function revokeRefreshSession(id, revokedAt = new Date(), client = null) {
  const executor = client || { query };
  await executor.query(
    `UPDATE refresh_sessions
     SET revoked_at = COALESCE(revoked_at, $2)
     WHERE id = $1`,
    [id, revokedAt],
  );
}

export async function revokeRefreshFamily(familyId, revokedAt = new Date(), client = null) {
  const executor = client || { query };
  await executor.query(
    `UPDATE refresh_sessions
     SET revoked_at = COALESCE(revoked_at, $2)
     WHERE family_id = $1`,
    [familyId, revokedAt],
  );
}
