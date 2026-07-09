import { query } from '../db/pool.js';

export async function findRoles() {
  const result = await query(
    `SELECT id, name, permissions, created_at as "createdAt", updated_at as "updatedAt"
     FROM system_roles
     ORDER BY name ASC`
  );
  return result.rows;
}

export async function findRoleById(id) {
  const result = await query(
    `SELECT id, name, permissions, created_at as "createdAt", updated_at as "updatedAt"
     FROM system_roles
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function createRole(name, permissions) {
  const result = await query(
    `INSERT INTO system_roles (name, permissions)
     VALUES ($1, $2)
     RETURNING id, name, permissions, created_at as "createdAt", updated_at as "updatedAt"`,
    [name, JSON.stringify(permissions)]
  );
  return result.rows[0];
}

export async function updateRole(id, name, permissions) {
  const result = await query(
    `UPDATE system_roles
     SET name = $2, permissions = $3
     WHERE id = $1
     RETURNING id, name, permissions, created_at as "createdAt", updated_at as "updatedAt"`,
    [id, name, JSON.stringify(permissions)]
  );
  return result.rows[0];
}

export async function deleteRole(id) {
  await query(`DELETE FROM system_roles WHERE id = $1`, [id]);
}
