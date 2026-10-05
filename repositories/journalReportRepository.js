import { query, withTransaction } from '../db/pool.js';

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
    createdBy: row.created_by || null,
    completedBy: row.completed_by || null,
    completedAt: row.completed_at || null,
    archivedAt: row.archived_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    reportId: row.report_id,
    documentDate: row.document_date,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
  };
}

function mapItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    reportId: row.report_id,
    batchId: row.batch_id,
    sourceKey: row.source_key,
    sourceRowNumber: row.source_row_number == null ? null : Number(row.source_row_number),
    date: row.date_text || '',
    pos: row.position_no || '',
    name: row.equipment_name || '',
    brand: row.brand || '',
    serial: row.serial_no || '',
    range: row.measure_range || '',
    location: row.location || '',
    skv: row.skv || '',
    work: row.work_type || '',
    executor: row.executor || '',
    signature: row.signature || '',
    createdAt: row.created_at,
  };
}

const REPORT_COLUMNS = `
  id, workspace_id, period_year, period_month, source_sheet_name, status,
  created_by, completed_by, completed_at, archived_at, created_at, updated_at`;

export async function listJournalReports(workspaceId) {
  const result = await query(
    `SELECT r.${REPORT_COLUMNS.replace(/\n/g,' ').replace(/\s+/g,' ').trim().split(', ').join(', r.')},
            COUNT(i.id)::int AS row_count,
            COUNT(DISTINCT b.id)::int AS batch_count
     FROM journal_reports r
     LEFT JOIN journal_report_items i ON i.report_id = r.id
     LEFT JOIN journal_report_batches b ON b.report_id = r.id
     WHERE r.workspace_id = $1::uuid
     GROUP BY r.id
     ORDER BY r.period_year DESC, r.period_month DESC`,
    [workspaceId],
  );
  return result.rows.map((row) => ({
    ...mapReport(row),
    rowCount: Number(row.row_count || 0),
    batchCount: Number(row.batch_count || 0),
  }));
}

export async function getJournalReportByKey(workspaceId, year, month, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT ${REPORT_COLUMNS}
     FROM journal_reports
     WHERE workspace_id = $1::uuid
       AND period_year = $2::smallint
       AND period_month = $3::smallint
     LIMIT 1`,
    [workspaceId, Number(year), Number(month)],
  );
  return mapReport(result.rows[0]);
}

export async function getJournalReportBundle(workspaceId, year, month, client = null) {
  const executor = client || { query };
  const report = await getJournalReportByKey(workspaceId, year, month, client);
  if (!report) return null;
  const [batchesResult, itemsResult] = await Promise.all([
    executor.query(
      `SELECT id, report_id, document_date, created_by, created_at
       FROM journal_report_batches
       WHERE report_id = $1::uuid
       ORDER BY document_date ASC, created_at ASC`,
      [report.id],
    ),
    executor.query(
      `SELECT id, report_id, batch_id, source_key, source_row_number,
              date_text, position_no, equipment_name, brand, serial_no,
              measure_range, location, skv, work_type, executor, signature, created_at
       FROM journal_report_items
       WHERE report_id = $1::uuid
       ORDER BY created_at ASC, source_row_number NULLS LAST`,
      [report.id],
    ),
  ]);
  return {
    report,
    batches: batchesResult.rows.map(mapBatch),
    items: itemsResult.rows.map(mapItem),
  };
}

export async function appendJournalReportRows(input) {
  return withTransaction(async (client) => {
    let report = await getJournalReportByKey(input.workspaceId, input.year, input.month, client);
    if (!report) {
      const inserted = await client.query(
        `INSERT INTO journal_reports (
           workspace_id, period_year, period_month, source_sheet_name, status, created_by
         )
         VALUES ($1::uuid, $2::smallint, $3::smallint, $4::text, 'draft', $5::uuid)
         ON CONFLICT (workspace_id, period_year, period_month) DO NOTHING
         RETURNING ${REPORT_COLUMNS}`,
        [
          input.workspaceId,
          Number(input.year),
          Number(input.month),
          clean(input.sourceSheetName),
          input.createdBy || null,
        ],
      );
      report = mapReport(inserted.rows[0])
        || await getJournalReportByKey(input.workspaceId, input.year, input.month, client);
    }

    if (!report) throw new Error('Monthly journal report could not be created.');
    if (report.status !== 'draft') {
      const error = new Error('Completed monthly journal report cannot be modified.');
      error.code = 'JOURNAL_REPORT_COMPLETED';
      error.statusCode = 409;
      throw error;
    }

    const existingKeysResult = await client.query(
      `SELECT source_key FROM journal_report_items WHERE report_id = $1::uuid`,
      [report.id],
    );
    const existingKeys = new Set(existingKeysResult.rows.map((row) => row.source_key));
    const incoming = Array.isArray(input.rows) ? input.rows : [];
    const freshRows = incoming.filter((row) => row.sourceKey && !existingKeys.has(row.sourceKey));

    if (!freshRows.length) {
      const bundle = await getJournalReportBundle(input.workspaceId, input.year, input.month, client);
      return { ...bundle, addedCount: 0, skippedCount: incoming.length };
    }

    const batchResult = await client.query(
      `INSERT INTO journal_report_batches (report_id, document_date, created_by)
       VALUES ($1::uuid, $2::date, $3::uuid)
       RETURNING id, report_id, document_date, created_by, created_at`,
      [report.id, input.documentDate, input.createdBy || null],
    );
    const batch = mapBatch(batchResult.rows[0]);

    let addedCount = 0;
    for (const row of freshRows) {
      const result = await client.query(
        `INSERT INTO journal_report_items (
           report_id, batch_id, source_key, source_row_number,
           date_text, position_no, equipment_name, brand, serial_no,
           measure_range, location, skv, work_type, executor, signature
         )
         VALUES (
           $1::uuid, $2::uuid, $3::text, $4::integer,
           $5::text, $6::text, $7::text, $8::text, $9::text,
           $10::text, $11::text, $12::text, $13::text, $14::text, $15::text
         )
         ON CONFLICT (report_id, source_key) DO NOTHING`,
        [
          report.id,
          batch.id,
          row.sourceKey,
          row.sourceRowNumber || null,
          clean(row.date),
          clean(row.pos),
          clean(row.name),
          clean(row.brand),
          clean(row.serial),
          clean(row.range),
          clean(row.location),
          clean(row.skv),
          clean(row.work),
          clean(row.executor),
          clean(row.signature),
        ],
      );
      addedCount += result.rowCount || 0;
    }

    if (!addedCount) {
      await client.query('DELETE FROM journal_report_batches WHERE id = $1::uuid', [batch.id]);
    }

    await client.query(
      `UPDATE journal_reports
       SET source_sheet_name = CASE WHEN $2::text = '' THEN source_sheet_name ELSE $2::text END,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [report.id, clean(input.sourceSheetName)],
    );

    const bundle = await getJournalReportBundle(input.workspaceId, input.year, input.month, client);
    return {
      ...bundle,
      addedCount,
      skippedCount: incoming.length - addedCount,
    };
  });
}
