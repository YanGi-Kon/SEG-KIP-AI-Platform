-- Reliable, idempotent final-PDF export jobs.
ALTER TABLE outbox_jobs
  DROP CONSTRAINT IF EXISTS outbox_jobs_job_type_check;

ALTER TABLE outbox_jobs
  ADD CONSTRAINT outbox_jobs_job_type_check
  CHECK (job_type IN (
    'send_email', 'sync_sheet', 'upload_drive', 'render_document', 'reconcile',
    'final_pdf_export'
  ));

ALTER TABLE outbox_jobs
  DROP CONSTRAINT IF EXISTS outbox_jobs_status_check;

ALTER TABLE outbox_jobs
  ADD CONSTRAINT outbox_jobs_status_check
  CHECK (status IN (
    'pending', 'processing', 'completed', 'failed', 'cancelled',
    'failed_retryable', 'failed_permanent'
  ));

ALTER TABLE outbox_jobs
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS result jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS outbox_jobs_final_pdf_pending_idx
  ON outbox_jobs (next_attempt_at, created_at)
  WHERE job_type = 'final_pdf_export'
    AND status IN ('pending', 'failed_retryable');

