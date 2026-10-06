CREATE TABLE instrument_passports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  instrument_key text NOT NULL,
  sheet_name text NOT NULL,
  instrument jsonb NOT NULL,
  source_version integer NOT NULL DEFAULT 0,
  published_version integer NOT NULL DEFAULT 0,
  current_file_id text NOT NULL DEFAULT '',
  current_file_url text NOT NULL DEFAULT '',
  output_folder_id text NOT NULL DEFAULT '',
  output_root_id text NOT NULL DEFAULT '',
  merged_pdf bytea,
  page_count integer NOT NULL DEFAULT 0,
  last_error text NOT NULL DEFAULT '',
  last_error_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, instrument_key)
);
CREATE TABLE instrument_passport_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id uuid NOT NULL REFERENCES instrument_passports(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  filename text NOT NULL,
  checksum text NOT NULL,
  pdf bytea NOT NULL,
  byte_count integer NOT NULL CHECK (byte_count > 0),
  page_count integer NOT NULL CHECK (page_count > 0),
  drive_file_id text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (passport_id, checksum),
  UNIQUE (passport_id, sequence)
);
ALTER TABLE outbox_jobs DROP CONSTRAINT outbox_jobs_job_type_check;
ALTER TABLE outbox_jobs ADD CONSTRAINT outbox_jobs_job_type_check
  CHECK (job_type IN ('send_email','sync_sheet','upload_drive','render_document','reconcile','final_pdf_export','passport_merge'));
CREATE INDEX outbox_passport_pending_idx ON outbox_jobs (next_attempt_at, created_at)
  WHERE job_type='passport_merge' AND status IN ('pending','failed_retryable','processing');
