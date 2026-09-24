import { query } from '../db/pool.js';

function clean(value) {
  return String(value ?? '').trim();
}

function mapReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    year: Number(row.period_year),
    month: Number(row.period_month),
    sourceSheetName: row.source_sheet_name || '',
    status: row.status || 'draft',
    rows: Array.isArray(row.rows_snapshot) ? row.rows_snapshot : [],
    signer: row.signer_snapshot && typeof row.signer_snapshot === 'object' ? row.signer_snapshot : {},
    finalPdf: row.final_pdf && typeof row.final_pdf === 'object' ? row.final_pdf : {},
    createdBy: row.created_by || null,
    completedBy: row.completed_by || null,
    completedAt: row.completed_at || null,
    archivedAt: row.archived_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = `
  id, workspace_id, period_year, period_month, source_sheet_name, status,
  rows_snapshot, signer_snapshot, final_pdf, created_by, completed_by,
  completed_at, archived_at, created_at, updated_at`;

export async function listFaultReports(workspaceId) {
  const result = await query(
    `SELECT ${COLUMNS}
     FROM fault_reports
     WHERE workspace_id = $1::uuid
     ORDER BY period_year DESC, period_month DESC`,
    [workspaceId],
  );
  return result.rows.map(mapReport);
}

export async function getFaultReport(workspaceId, year, month) {
  const result = await query(
    `SELECT ${COLUMNS}
     FROM fault_reports
     WHERE workspace_id = $1::uuid
       AND period_year = $2::smallint
       AND period_month = $3::smallint
     LIMIT 1`,
    [workspaceId, Number(year), Number(month)],
  );
  return mapReport(result.rows[0]);
}

export async function saveFaultReport(input) {
  const result = await query(
    `INSERT INTO fault_reports (
       workspace_id, period_year, period_month, source_sheet_name, status,
       rows_snapshot, signer_snapshot, created_by
     )
     VALUES ($1::uuid, $2::smallint, $3::smallint, $4::text, 'draft',
             $5::jsonb, $6::jsonb, $7::uuid)
     ON CONFLICT (workspace_id, period_year, period_month)
     DO UPDATE SET
       source_sheet_name = EXCLUDED.source_sheet_name,
       rows_snapshot = EXCLUDED.rows_snapshot,
       signer_snapshot = EXCLUDED.signer_snapshot,
       updated_at = NOW()
     WHERE fault_reports.status = 'draft'
     RETURNING ${COLUMNS}`,
    [
      input.workspaceId,
      Number(input.year),
      Number(input.month),
      clean(input.sourceSheetName),
      JSON.stringify(Array.isArray(input.rows) ? input.rows : []),
      JSON.stringify(input.signer && typeof input.signer === 'object' ? input.signer : {}),
      input.createdBy || null,
    ],
  );
  return mapReport(result.rows[0]);
}

export async function deleteFaultReport(workspaceId, year, month) {
  const result = await query(
    `DELETE FROM fault_reports
     WHERE workspace_id = $1::uuid
       AND period_year = $2::smallint
       AND period_month = $3::smallint
       AND status = 'draft'
     RETURNING ${COLUMNS}`,
    [workspaceId, Number(year), Number(month)],
  );
  return mapReport(result.rows[0]);
}

export async function completeFaultReport(workspaceId, year, month, finalPdf, completedBy = null) {
  const result = await query(
    `UPDATE fault_reports
     SET status = 'completed',
         final_pdf = $4::jsonb,
         completed_by = $5::uuid,
         completed_at = COALESCE(completed_at, NOW()),
         updated_at = NOW()
     WHERE workspace_id = $1::uuid
       AND period_year = $2::smallint
       AND period_month = $3::smallint
     RETURNING ${COLUMNS}`,
    [
      workspaceId,
      Number(year),
      Number(month),
      JSON.stringify(finalPdf || {}),
      completedBy || null,
    ],
  );
  return mapReport(result.rows[0]);
}
