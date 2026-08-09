import { query } from '../db/pool.js';

function executor(client) {
  return client || { query };
}

function mapWorkspace(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    slug: row.slug,
    spreadsheetId: row.spreadsheet_id,
    spreadsheetUrl: row.spreadsheet_url,
    driveFolderId: row.drive_folder_id || '',
    finalDocumentsFolderId: row.final_documents_folder_id || '',
    timeZone: row.time_zone,
    status: row.status,
    isDefault: row.is_default,
    serviceAccountBase64: row.service_account_base64 || '',
    moduleSettings: row.module_settings || {},
    memberRole: row.member_role || null,
    memberStatus: row.member_status || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createWorkspaceRecord(input, client = null) {
  const result = await executor(client).query(
    `INSERT INTO workspaces
       (owner_id, name, slug, spreadsheet_id, spreadsheet_url,
        drive_folder_id, final_documents_folder_id, time_zone, status, is_default, service_account_base64, module_settings)
     VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), $8, $9, $10, NULLIF($11, ''), $12)
     RETURNING id, owner_id, name, slug, spreadsheet_id, spreadsheet_url,
               drive_folder_id, final_documents_folder_id, time_zone, status, is_default,
               service_account_base64, module_settings, created_at, updated_at`,
    [
      input.ownerId,
      input.name,
      input.slug,
      input.spreadsheetId,
      input.spreadsheetUrl,
      input.driveFolderId || '',
      input.finalDocumentsFolderId || '',
      input.timeZone || 'Asia/Tashkent',
      input.status || 'active',
      Boolean(input.isDefault),
      input.serviceAccountBase64 || '',
      input.moduleSettings || {},
    ],
  );
  return mapWorkspace(result.rows[0]);
}

export async function addWorkspaceMember(input, client = null) {
  const result = await executor(client).query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, user_id)
     DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status
     RETURNING id, workspace_id, user_id, role, status, created_at, updated_at`,
    [input.workspaceId, input.userId, input.role, input.status || 'active'],
  );
  return result.rows[0];
}

export async function listUserWorkspaces(userId) {
  const result = await query(
    `SELECT w.id, w.owner_id, w.name, w.slug, w.spreadsheet_id, w.spreadsheet_url,
            w.drive_folder_id, w.final_documents_folder_id, w.time_zone, w.status, w.is_default,
            w.service_account_base64, w.module_settings, w.created_at, w.updated_at,
            wm.role AS member_role, wm.status AS member_status
     FROM workspace_members wm
     JOIN workspaces w ON w.id = wm.workspace_id
     WHERE wm.user_id = $1
       AND wm.status = 'active'
       AND w.status <> 'archived'
     ORDER BY w.is_default DESC, w.name ASC`,
    [userId],
  );
  return result.rows.map(mapWorkspace);
}

export async function listActiveWorkspaces(client = null) {
  const result = await executor(client).query(
    `SELECT id, owner_id, name, slug, spreadsheet_id, spreadsheet_url,
            drive_folder_id, final_documents_folder_id, time_zone, status, is_default,
            service_account_base64, module_settings, created_at, updated_at,
            'owner'::text AS member_role, 'active'::text AS member_status
     FROM workspaces
     WHERE status <> 'archived'
     ORDER BY is_default DESC, updated_at DESC, name ASC`,
  );
  return result.rows.map(mapWorkspace);
}

export async function findWorkspaceForUser(workspaceId, userId, { forUpdate = false, client = null } = {}) {
  const result = await executor(client).query(
    `SELECT w.id, w.owner_id, w.name, w.slug, w.spreadsheet_id, w.spreadsheet_url,
            w.drive_folder_id, w.final_documents_folder_id, w.time_zone, w.status, w.is_default,
            w.service_account_base64, w.module_settings, w.created_at, w.updated_at,
            wm.role AS member_role, wm.status AS member_status
     FROM workspace_members wm
     JOIN workspaces w ON w.id = wm.workspace_id
     WHERE w.id = $1 AND wm.user_id = $2
     LIMIT 1${forUpdate ? ' FOR UPDATE OF w' : ''}`,
    [workspaceId, userId],
  );
  return mapWorkspace(result.rows[0]);
}

export async function findWorkspaceById(workspaceId, client = null) {
  const result = await executor(client).query(
    `SELECT id, owner_id, name, slug, spreadsheet_id, spreadsheet_url,
            drive_folder_id, final_documents_folder_id, time_zone, status, is_default,
            service_account_base64, module_settings, created_at, updated_at
     FROM workspaces
     WHERE id = $1
       AND status <> 'archived'
     LIMIT 1`,
    [workspaceId],
  );
  return mapWorkspace(result.rows[0]);
}

export async function findWorkspaceBySpreadsheetUrl(spreadsheetUrl, client = null) {
  const result = await executor(client).query(
    `SELECT id, owner_id, name, slug, spreadsheet_id, spreadsheet_url,
            drive_folder_id, final_documents_folder_id, time_zone, status, is_default,
            service_account_base64, module_settings, created_at, updated_at
     FROM workspaces
     WHERE spreadsheet_url = $1
       AND status <> 'archived'
     ORDER BY is_default DESC, updated_at DESC
     LIMIT 1`,
    [spreadsheetUrl],
  );
  return mapWorkspace(result.rows[0]);
}

export async function updateWorkspaceRecord(workspaceId, input, client = null) {
  const result = await executor(client).query(
    `UPDATE workspaces
     SET name = COALESCE($2, name),
         slug = COALESCE($3, slug),
         spreadsheet_id = COALESCE($4, spreadsheet_id),
         spreadsheet_url = COALESCE($5, spreadsheet_url),
         drive_folder_id = CASE WHEN $6::text IS NULL THEN drive_folder_id ELSE NULLIF($6, '') END,
         final_documents_folder_id = CASE WHEN $7::text IS NULL THEN final_documents_folder_id ELSE NULLIF($7, '') END,
         time_zone = COALESCE($8, time_zone),
         status = COALESCE($9, status),
         service_account_base64 = CASE WHEN $10::text IS NULL THEN service_account_base64 ELSE NULLIF($10, '') END,
         module_settings = COALESCE($11, module_settings)
     WHERE id = $1
     RETURNING id, owner_id, name, slug, spreadsheet_id, spreadsheet_url,
               drive_folder_id, final_documents_folder_id, time_zone, status, is_default,
               service_account_base64, module_settings, created_at, updated_at`,
    [
      workspaceId,
      input.name ?? null,
      input.slug ?? null,
      input.spreadsheetId ?? null,
      input.spreadsheetUrl ?? null,
      input.driveFolderId ?? null,
      input.finalDocumentsFolderId ?? null,
      input.timeZone ?? null,
      input.status ?? null,
      input.serviceAccountBase64 ?? null,
      input.moduleSettings ?? null,
    ],
  );
  return mapWorkspace(result.rows[0]);
}

export async function getWorkspacePersonalDriveConfig(workspaceId, client = null) {
  const result = await executor(client).query(
    `SELECT personal_drive_apps_script_url, personal_drive_secret_encrypted
     FROM workspaces
     WHERE id = $1 AND status <> 'archived'
     LIMIT 1`,
    [workspaceId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    appsScriptUrl: row.personal_drive_apps_script_url || '',
    secretEncrypted: row.personal_drive_secret_encrypted || '',
    configured: Boolean(row.personal_drive_apps_script_url && row.personal_drive_secret_encrypted),
  };
}

export async function saveWorkspacePersonalDriveConfig(workspaceId, input = {}, client = null) {
  const result = await executor(client).query(
    `UPDATE workspaces
     SET personal_drive_apps_script_url = NULLIF($2, ''),
         personal_drive_secret_encrypted = NULLIF($3, '')
     WHERE id = $1 AND status <> 'archived'
     RETURNING id, personal_drive_apps_script_url,
               personal_drive_secret_encrypted IS NOT NULL AS configured`,
    [workspaceId, input.appsScriptUrl || '', input.secretEncrypted || ''],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    workspaceId: row.id,
    appsScriptUrl: row.personal_drive_apps_script_url || '',
    configured: Boolean(row.configured && row.personal_drive_apps_script_url),
  };
}

export async function archiveWorkspaceRecord(workspaceId, client = null) {
  const result = await executor(client).query(
    `UPDATE workspaces
     SET status = 'archived'
     WHERE id = $1 AND status <> 'archived'
     RETURNING id, owner_id, name, slug, spreadsheet_id, spreadsheet_url,
               drive_folder_id, final_documents_folder_id, time_zone, status, is_default,
               module_settings, created_at, updated_at`,
    [workspaceId],
  );
  return mapWorkspace(result.rows[0]);
}

export async function listWorkspaceMembers(workspaceId) {
  const result = await query(
    `SELECT wm.id, wm.workspace_id, wm.user_id, wm.role, wm.status,
            wm.created_at, wm.updated_at,
            u.full_name, u.email, u.platform_role, u.status AS user_status
     FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = $1
     ORDER BY CASE wm.role
       WHEN 'owner' THEN 1 WHEN 'administrator' THEN 2
       WHEN 'operator' THEN 3 WHEN 'viewer' THEN 4
       ELSE 5 END,
       u.full_name ASC`,
    [workspaceId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    fullName: row.full_name,
    email: row.email,
    platformRole: row.platform_role,
    userStatus: row.user_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function mapWorkspaceMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    fullName: row.full_name,
    email: row.email,
    platformRole: row.platform_role,
    userStatus: row.user_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const WORKSPACE_MEMBER_SELECT = `
  SELECT wm.id, wm.workspace_id, wm.user_id, wm.role, wm.status,
         wm.created_at, wm.updated_at,
         u.full_name, u.email, u.platform_role, u.status AS user_status
  FROM workspace_members wm
  JOIN users u ON u.id = wm.user_id`;

export async function findWorkspaceMemberById(workspaceId, memberId, client = null) {
  const result = await executor(client).query(
    `${WORKSPACE_MEMBER_SELECT}
     WHERE wm.workspace_id = $1 AND wm.id = $2
     LIMIT 1`,
    [workspaceId, memberId],
  );
  return mapWorkspaceMember(result.rows[0]);
}

export async function findWorkspaceMemberByUserId(workspaceId, userId, client = null) {
  const result = await executor(client).query(
    `${WORKSPACE_MEMBER_SELECT}
     WHERE wm.workspace_id = $1 AND wm.user_id = $2
     LIMIT 1`,
    [workspaceId, userId],
  );
  return mapWorkspaceMember(result.rows[0]);
}

export async function updateWorkspaceMemberRecord(workspaceId, memberId, input, client = null) {
  const result = await executor(client).query(
    `UPDATE workspace_members
     SET role = $3, status = $4
     WHERE workspace_id = $1 AND id = $2
     RETURNING id`,
    [workspaceId, memberId, input.role, input.status],
  );
  if (!result.rows[0]) return null;
  return findWorkspaceMemberById(workspaceId, memberId, client);
}

export async function deleteWorkspaceMemberRecord(workspaceId, memberId, client = null) {
  const result = await executor(client).query(
    `DELETE FROM workspace_members
     WHERE workspace_id = $1 AND id = $2
     RETURNING id, workspace_id, user_id, role, status`,
    [workspaceId, memberId],
  );
  return result.rows[0] || null;
}
