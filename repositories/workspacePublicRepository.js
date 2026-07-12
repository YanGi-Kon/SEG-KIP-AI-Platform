import { query } from '../db/pool.js';

export async function findWorkspaceForSignedLink(workspaceId) {
  const result = await query(
    `SELECT id, owner_id, name, slug, spreadsheet_id, spreadsheet_url,
            main_sheet_name, drive_folder_id, time_zone, status, is_default,
            service_account_client_email, service_account_project_id,
            service_account_status, service_account_updated_at,
            created_at, updated_at
       FROM workspaces
      WHERE id = $1
        AND status IN ('draft', 'active', 'disabled')
      LIMIT 1`,
    [workspaceId],
  );
  const row = result.rows[0];
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
