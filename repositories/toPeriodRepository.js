import { query, withTransaction } from '../db/pool.js';

function executor(client) {
  return client || { query };
}

function dateOnly(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapPeriod(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    year: Number(row.period_year),
    month: Number(row.period_month),
    documentDate: dateOnly(row.document_date),
    sourceSheetName: row.source_sheet_name || '',
    monthlySheetName: row.monthly_sheet_name || '',
    status: row.status || 'draft',
    conclusion: row.conclusion || '',
    sourceSnapshot: row.source_snapshot || {},
    kipMasterSignerId: row.kip_master_signer_id || null,
    kipMasterPositionSnapshot: row.kip_master_position_snapshot || '',
    kipMasterFioSnapshot: row.kip_master_fio_snapshot || '',
    kipMasterSignatureFileIdSnapshot: row.kip_master_signature_file_id_snapshot || '',
    kipMasterSignatureUrlSnapshot: row.kip_master_signature_url_snapshot || '',
    syncStatus: row.sync_status || 'pending',
    syncError: row.sync_error || '',
    lastSheetSyncAt: row.last_sheet_sync_at || null,
    createdBy: row.created_by || null,
    completedBy: row.completed_by || null,
    completedAt: row.completed_at || null,
    archivedAt: row.archived_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    periodId: row.period_id,
    sourceRowNumber: Number(row.source_row_number),
    sectionName: row.section_name || 'ASOSIY',
    no: row.no || '',
    serialNo: row.serial_no || '',
    equipmentName: row.equipment_name || '',
    positionNo: row.position_no || '',
    quantity: row.quantity || '',
    technicalState: row.technical_state || '',
    workType: row.work_type || '',
    note: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PERIOD_COLUMNS = `
  id, workspace_id, period_year, period_month, document_date,
  source_sheet_name, monthly_sheet_name, status, conclusion, source_snapshot,
  kip_master_signer_id, kip_master_position_snapshot, kip_master_fio_snapshot,
  kip_master_signature_file_id_snapshot, kip_master_signature_url_snapshot,
  sync_status, sync_error, last_sheet_sync_at,
  created_by, completed_by, completed_at, archived_at, created_at, updated_at`;

const ITEM_COLUMNS = `
  id, period_id, source_row_number, section_name, no, serial_no,
  equipment_name, position_no, quantity, technical_state, work_type, note,
  created_at, updated_at`;

function prefixedItemColumns(alias = 'i') {
  return ITEM_COLUMNS
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(', ')
    .map((column) => `${alias}.${column}`)
    .join(', ');
}

export async function listToPeriods(workspaceId, { year = null } = {}) {
  const result = await query(
    `SELECT ${PERIOD_COLUMNS}
     FROM to_periods
     WHERE workspace_id = $1::uuid
       AND ($2::smallint IS NULL OR period_year = $2::smallint)
     ORDER BY period_year DESC, period_month DESC`,
    [workspaceId, year == null ? null : Number(year)],
  );
  return result.rows.map(mapPeriod);
}

export async function getToPeriodByKey(workspaceId, year, month, client = null) {
  const result = await executor(client).query(
    `SELECT ${PERIOD_COLUMNS}
     FROM to_periods
     WHERE workspace_id = $1::uuid
       AND period_year = $2::smallint
       AND period_month = $3::smallint
     LIMIT 1`,
    [workspaceId, Number(year), Number(month)],
  );
  return mapPeriod(result.rows[0]);
}

export async function getToPeriodById(workspaceId, periodId, client = null) {
  const result = await executor(client).query(
    `SELECT ${PERIOD_COLUMNS}
     FROM to_periods
     WHERE workspace_id = $1::uuid AND id = $2::uuid
     LIMIT 1`,
    [workspaceId, periodId],
  );
  return mapPeriod(result.rows[0]);
}

export async function listToPeriodItems(periodId, client = null) {
  const result = await executor(client).query(
    `SELECT ${ITEM_COLUMNS}
     FROM to_period_items
     WHERE period_id = $1::uuid
     ORDER BY source_row_number ASC`,
    [periodId],
  );
  return result.rows.map(mapItem);
}

export async function getToPeriodBundle(workspaceId, year, month) {
  const period = await getToPeriodByKey(workspaceId, year, month);
  if (!period) return null;
  const items = await listToPeriodItems(period.id);
  return { period, items };
}

export async function createToPeriodRecord(input) {
  return withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO to_periods (
         workspace_id, period_year, period_month, document_date,
         source_sheet_name, status, conclusion, source_snapshot, created_by
       )
       VALUES ($1::uuid, $2::smallint, $3::smallint, $4::date,
               $5::text, 'draft', $6::text, $7::jsonb, $8::uuid)
       ON CONFLICT (workspace_id, period_year, period_month) DO NOTHING
       RETURNING ${PERIOD_COLUMNS}`,
      [
        input.workspaceId,
        Number(input.year),
        Number(input.month),
        input.documentDate,
        input.sourceSheetName,
        input.conclusion,
        JSON.stringify(input.sourceSnapshot || {}),
        input.createdBy || null,
      ],
    );

    let created = true;
    let period = mapPeriod(inserted.rows[0]);
    if (!period) {
      created = false;
      period = await getToPeriodByKey(input.workspaceId, input.year, input.month, client);
      const items = period ? await listToPeriodItems(period.id, client) : [];
      return { created, period, items };
    }

    for (const item of input.items || []) {
      await client.query(
        `INSERT INTO to_period_items (
           period_id, source_row_number, section_name, no, serial_no,
           equipment_name, position_no, quantity, technical_state, work_type, note
         )
         VALUES ($1::uuid, $2::integer, $3::text, $4::text, $5::text,
                 $6::text, $7::text, $8::text, $9::text, $10::text, $11::text)
         ON CONFLICT (period_id, source_row_number) DO NOTHING`,
        [
          period.id,
          Number(item.sourceRowNumber),
          item.sectionName || 'ASOSIY',
          item.no || '',
          item.serialNo || '',
          item.equipmentName || '',
          item.positionNo || '',
          item.quantity || '',
          item.technicalState || '',
          item.workType || '',
          item.note || '',
        ],
      );
    }

    const items = await listToPeriodItems(period.id, client);
    return { created, period, items };
  });
}

export async function updateToPeriodSheetState(workspaceId, periodId, input = {}) {
  const result = await query(
    `UPDATE to_periods
     SET monthly_sheet_name = CASE WHEN $3::text IS NULL THEN monthly_sheet_name ELSE $3::text END,
         sync_status = COALESCE($4::text, sync_status),
         sync_error = CASE WHEN $5::text IS NULL THEN sync_error ELSE NULLIF($5::text, '') END,
         last_sheet_sync_at = CASE WHEN $6::boolean THEN NOW() ELSE last_sheet_sync_at END
     WHERE workspace_id = $1::uuid AND id = $2::uuid
     RETURNING ${PERIOD_COLUMNS}`,
    [
      workspaceId,
      periodId,
      input.monthlySheetName === undefined ? null : String(input.monthlySheetName || ''),
      input.syncStatus ?? null,
      input.syncError === undefined ? null : String(input.syncError || ''),
      Boolean(input.touchSyncTime),
    ],
  );
  return mapPeriod(result.rows[0]);
}

export async function updateToPeriodItem(workspaceId, periodId, itemId, input = {}) {
  const result = await query(
    `UPDATE to_period_items AS i
     SET technical_state = CASE WHEN $4::text IS NULL THEN i.technical_state ELSE $4::text END,
         work_type = CASE WHEN $5::text IS NULL THEN i.work_type ELSE $5::text END,
         note = CASE WHEN $6::text IS NULL THEN i.note ELSE $6::text END
     FROM to_periods AS p
     WHERE p.id = i.period_id
       AND p.workspace_id = $1::uuid
       AND p.id = $2::uuid
       AND i.id = $3::uuid
       AND p.status = 'draft'
     RETURNING ${prefixedItemColumns('i')}`,
    [
      workspaceId,
      periodId,
      itemId,
      input.technicalState === undefined ? null : String(input.technicalState ?? ''),
      input.workType === undefined ? null : String(input.workType ?? ''),
      input.note === undefined ? null : String(input.note ?? ''),
    ],
  );
  return mapItem(result.rows[0]);
}

export async function replaceToPeriodEditableFields(workspaceId, periodId, rows = []) {
  return withTransaction(async (client) => {
    const period = await getToPeriodById(workspaceId, periodId, client);
    if (!period) return { period: null, updated: 0 };
    if (period.status !== 'draft') return { period, updated: 0, locked: true };

    let updated = 0;
    for (const row of rows) {
      const result = await client.query(
        `UPDATE to_period_items
         SET technical_state = $3::text,
             work_type = $4::text,
             note = $5::text
         WHERE period_id = $1::uuid AND source_row_number = $2::integer`,
        [
          periodId,
          Number(row.sourceRowNumber),
          String(row.technicalState || ''),
          String(row.workType || ''),
          String(row.note || ''),
        ],
      );
      updated += result.rowCount || 0;
    }

    return { period, updated };
  });
}
