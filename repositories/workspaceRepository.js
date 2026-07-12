import { query } from '../db/pool.js';

function executor(client) {
  return client || { query };
}

const WORKSPACE_RETURN_COLUMNS = `
  id, owner_id, name, slug, spreadsheet_id, spreadsheet_url,
  main_sheet_name, drive_folder_id, time_zone, status, is_default,
  service_account_client_email, service_account_project_id,
  service_account_status, service_account_updated_at,
  created_at, updated_at
`;

function mapWorkspace(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    slug: row.slug,
    spreadsheetId: row.spreadsheet_id,
    spreadsheetUrl: row.spreadsheet_url,
    mainSheetName: row.main_sheet_name,
    driveFolderId: row.drive_folder_id || '',
    timeZone: row.time_zone,
    status: row.status,
    isDefault: row.is_default,
    serviceAccountClientEmail: row.service_account_client_email || '',
    serviceAccountProjectId: row.service_account_project_id || '',
    serviceAccountStatus: row.service_account_status || 'missing',
    serviceAccountUpdatedAt: row.service_account_updated_at || null,
    memberRole: row.member_role || null,
    memberStatus: row.member_status || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createWorkspaceRecord(input, client = null) {
  const result = await executor(client).query(
    `INSERT INTO workspaces
       (owner_id, name, slug, spreadsheet_id, spreadsheet_url, main_sheet_name,
        drive_folder_id, time_zone, status, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), $8, $9, $10)
     RETURNING ${WORKSPACE_RETURN_COLUMNS}`,
    [
      input.ownerId,
      input.name,
      input.slug,
      input.spreadsheetId,
      input.spreadsheetUrl,
      input.mainSheetName,
      input.driveFolderId || '',
      input.timeZone || 'Asia/Tashkent',
      input.status || 'draft',
      Boolean(input.isDefault),
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
            w.main_sheet_name, w.drive_folder_id, w.time_zone, w.status, w.is_default,
            w.service_account_client_email, w.service_account_project_id,
            w.service_account_status, w.service_account_updated_at,
            w.created_at, w.updated_at,
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

export async function findWorkspaceForUser(workspaceId, userId, { forUpdate = false, client = null } = {}) {
  const result = await executor(client).query(
    `SELECT w.id, w.owner_id, w.name, w.slug, w.spreadsheet_id, w.spreadsheet_url,
            w.main_sheet_name, w.drive_folder_id, w.time_zone, w.status, w.is_default,
            w.service_account_client_email, w.service_account_project_id,
            w.service_account_status, w.service_account_updated_at,
            w.created_at, w.updated_at,
            wm.role AS member_role, wm.status AS member_status
     FROM workspace_members wm
     JOIN workspaces w ON w.id = wm.workspace_id
     WHERE w.id = $1 AND wm.user_id = $2
     LIMIT 1${forUpdate ? ' FOR UPDATE OF w' : ''}`,
    [workspaceId, userId],
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
         main_sheet_name = COALESCE($6, main_sheet_name),
         drive_folder_id = CASE WHEN $7::text IS NULL THEN drive_folder_id ELSE NULLIF($7, '') END,
         time_zone = COALESCE($8, time_zone),
         status = COALESCE($9, status)
     WHERE id = $1
     RETURNING ${WORKSPACE_RETURN_COLUMNS}`,
    [
      workspaceId,
      input.name ?? null,
      input.slug ?? null,
      input.spreadsheetId ?? null,
      input.spreadsheetUrl ?? null,
      input.mainSheetName ?? null,
      input.driveFolderId === undefined ? null : input.driveFolderId,
      input.timeZone ?? null,
      input.status ?? null,
    ],
  );
  return mapWorkspace(result.rows[0]);
}

export async function updateWorkspaceServiceAccountRecord(workspaceId, input, client = null) {
  const result = await executor(client).query(
    `UPDATE workspaces
     SET service_account_encrypted_json = $2,
         service_account_client_email = $3,
         service_account_project_id = $4,
         service_account_status = 'configured',
         service_account_updated_at = NOW()
     WHERE id = $1
     RETURNING ${WORKSPACE_RETURN_COLUMNS}`,
    [workspaceId, input.encryptedJson, input.clientEmail, input.projectId],
  );
  return mapWorkspace(result.rows[0]);
}

export async function clearWorkspaceServiceAccountRecord(workspaceId, client = null) {
  const result = await executor(client).query(
    `UPDATE workspaces
     SET service_account_encrypted_json = NULL,
         service_account_client_email = NULL,
         service_account_project_id = NULL,
         service_account_status = 'missing',
         service_account_updated_at = NOW()
     WHERE id = $1
     RETURNING ${WORKSPACE_RETURN_COLUMNS}`,
    [workspaceId],
  );
  return mapWorkspace(result.rows[0]);
}

export async function getWorkspaceServiceAccountRecord(workspaceId, client = null) {
  const result = await executor(client).query(
    `SELECT id,
            service_account_encrypted_json,
            service_account_client_email,
            service_account_project_id,
            service_account_status,
            service_account_updated_at
     FROM workspaces
     WHERE id = $1 AND status <> 'archived'
     LIMIT 1`,
    [workspaceId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    workspaceId: row.id,
    encryptedJson: row.service_account_encrypted_json || '',
    clientEmail: row.service_account_client_email || '',
    projectId: row.service_account_project_id || '',
    status: row.service_account_status || 'missing',
    updatedAt: row.service_account_updated_at || null,
  };
}

export async function archiveWorkspaceRecord(workspaceId, client = null) {
  const result = await executor(client).query(
    `UPDATE workspaces
     SET status = 'archived'
     WHERE id = $1 AND status <> 'archived'
     RETURNING ${WORKSPACE_RETURN_COLUMNS}`,
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
       WHEN 'department_manager' THEN 3 WHEN 'operator' THEN 4
       WHEN 'engineer' THEN 5 ELSE 6 END,
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
