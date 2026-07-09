import { query } from '../db/pool.js';

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    passwordHash: row.password_hash,
    platformRole: row.platform_role,
    permissions: row.permissions || [],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findUserByEmail(email, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT u.id, u.full_name, u.email, u.password_hash, r.name as platform_role, r.permissions, u.status, u.created_at, u.updated_at
     FROM users u
     JOIN system_roles r ON u.system_role_id = r.id
     WHERE u.email = $1
     LIMIT 1`,
    [String(email || '').trim().toLowerCase()],
  );
  return mapUser(result.rows[0]);
}

export async function findUserById(id, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT u.id, u.full_name, u.email, u.password_hash, r.name as platform_role, r.permissions, u.status, u.created_at, u.updated_at
     FROM users u
     JOIN system_roles r ON u.system_role_id = r.id
     WHERE u.id = $1
     LIMIT 1`,
    [id],
  );
  return mapUser(result.rows[0]);
}

export async function createUser(input, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `INSERT INTO users (full_name, email, password_hash, system_role_id, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, full_name, email, password_hash, status, created_at, updated_at`,
    [
      String(input.fullName || '').trim(),
      String(input.email || '').trim().toLowerCase(),
      input.passwordHash,
      input.systemRoleId,
      input.status || 'active',
    ],
  );
  return mapUser(result.rows[0]);
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    platformRole: user.platformRole,
    permissions: user.permissions,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
