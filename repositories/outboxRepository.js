import { query } from '../db/pool.js';

function mapJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    jobType: row.job_type,
    idempotencyKey: row.idempotency_key,
    payload: row.payload || {},
    status: row.status,
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 0),
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error || '',
    lastErrorCode: row.last_error_code || '',
    result: row.result || {},
  };
}

export async function enqueueFinalPdfExport({ workspaceId, actNo, updatedHtml = '' }, client = null) {
  const executor = client || { query };
  const idempotencyKey = `final-pdf:${workspaceId}:${actNo}:v1`;
  const result = await executor.query(
    `INSERT INTO outbox_jobs (
       workspace_id, job_type, idempotency_key, payload, status, max_attempts
     ) VALUES ($1, 'final_pdf_export', $2, $3::jsonb, 'pending', 6)
     ON CONFLICT (idempotency_key) DO UPDATE
       SET payload = CASE
         WHEN outbox_jobs.status = 'completed' THEN outbox_jobs.payload
         ELSE EXCLUDED.payload
       END
     RETURNING *`,
    [workspaceId, idempotencyKey, JSON.stringify({ workspaceId, actNo, updatedHtml })],
  );
  return mapJob(result.rows[0]);
}

export async function claimNextFinalPdfExport(workerId) {
  const result = await query(
    `WITH candidate AS (
       SELECT id
       FROM outbox_jobs
       WHERE job_type = 'final_pdf_export'
         AND status IN ('pending', 'failed_retryable')
         AND next_attempt_at <= NOW()
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE outbox_jobs j
     SET status = 'processing',
         attempts = attempts + 1,
         locked_at = NOW(),
         locked_by = $1
     FROM candidate
     WHERE j.id = candidate.id
     RETURNING j.*`,
    [workerId],
  );
  return mapJob(result.rows[0]);
}

export async function claimFinalPdfExportById(jobId, workerId) {
  const result = await query(
    `UPDATE outbox_jobs
     SET status = 'processing',
         attempts = attempts + 1,
         locked_at = NOW(),
         locked_by = $2
     WHERE id = $1
       AND job_type = 'final_pdf_export'
       AND status IN ('pending', 'failed_retryable')
       AND next_attempt_at <= NOW()
     RETURNING *`,
    [jobId, workerId],
  );
  return mapJob(result.rows[0]);
}

export async function completeFinalPdfExport(jobId, resultPayload) {
  const result = await query(
    `UPDATE outbox_jobs
     SET status = 'completed',
         result = $2::jsonb,
         completed_at = NOW(),
         locked_at = NULL,
         locked_by = NULL,
         last_error = NULL,
         last_error_code = NULL
     WHERE id = $1
     RETURNING *`,
    [jobId, JSON.stringify(resultPayload || {})],
  );
  return mapJob(result.rows[0]);
}

export async function failFinalPdfExport(job, error, { retryable }) {
  const exhausted = job.attempts >= job.maxAttempts;
  const shouldRetry = retryable && !exhausted;
  const delaySeconds = Math.min(3600, 15 * (2 ** Math.max(0, job.attempts - 1)));
  const result = await query(
    `UPDATE outbox_jobs
     SET status = $2,
         last_error = $3,
         last_error_code = $4,
         next_attempt_at = CASE
           WHEN $2 = 'failed_retryable' THEN NOW() + ($5 * INTERVAL '1 second')
           ELSE next_attempt_at
         END,
         locked_at = NULL,
         locked_by = NULL
     WHERE id = $1
     RETURNING *`,
    [
      job.id,
      shouldRetry ? 'failed_retryable' : 'failed_permanent',
      String(error?.message || 'Final PDF export failed').slice(0, 1000),
      String(error?.code || 'FINAL_PDF_EXPORT_FAILED').slice(0, 120),
      delaySeconds,
    ],
  );
  return mapJob(result.rows[0]);
}

export async function retryFinalPdfExport(workspaceId, jobId) {
  const result = await query(
    `UPDATE outbox_jobs
     SET status = 'pending',
         next_attempt_at = NOW(),
         locked_at = NULL,
         locked_by = NULL,
         last_error = NULL,
         last_error_code = NULL
     WHERE id = $1
       AND workspace_id = $2
       AND job_type = 'final_pdf_export'
       AND status IN ('failed_retryable', 'failed_permanent')
     RETURNING *`,
    [jobId, workspaceId],
  );
  return mapJob(result.rows[0]);
}
