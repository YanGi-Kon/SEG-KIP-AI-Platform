BEGIN;

CREATE TABLE IF NOT EXISTS signers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  position text NOT NULL CHECK (char_length(trim(position)) BETWEEN 2 AND 200),
  fio text NOT NULL CHECK (char_length(trim(fio)) BETWEEN 2 AND 250),
  gmail citext NOT NULL,
  signature_file_id text,
  signature_file_name text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS signers_workspace_gmail_active_idx
  ON signers (workspace_id, gmail)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  act_no text NOT NULL,
  source_sheet text,
  source_row integer,
  source_key_v1 text,
  source_key_v2 text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'partially_approved', 'approved', 'rejected', 'cancelled')),
  sheet_row_start integer,
  a4_html text,
  a4_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_hash text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, act_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS documents_workspace_source_v2_idx
  ON documents (workspace_id, source_key_v2)
  WHERE source_key_v2 IS NOT NULL AND source_key_v2 <> '';

CREATE INDEX IF NOT EXISTS documents_workspace_status_idx
  ON documents (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_workspace_source_v1_idx
  ON documents (workspace_id, source_key_v1)
  WHERE source_key_v1 IS NOT NULL AND source_key_v1 <> '';

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  signer_id uuid NOT NULL REFERENCES signers(id) ON DELETE RESTRICT,
  signer_position_snapshot text NOT NULL,
  signer_fio_snapshot text NOT NULL,
  signer_gmail_snapshot citext NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'opened', 'approved', 'rejected', 'cancelled', 'expired')),
  token_hash text NOT NULL,
  token_version integer NOT NULL DEFAULT 1 CHECK (token_version > 0),
  opened_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, signer_id)
);

CREATE INDEX IF NOT EXISTS approvals_workspace_status_idx
  ON approvals (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS approvals_document_idx
  ON approvals (document_id, status);
CREATE INDEX IF NOT EXISTS approvals_token_hash_idx
  ON approvals (token_hash);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor text,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  signer_id uuid REFERENCES signers(id) ON DELETE SET NULL,
  gmail citext,
  ip_address inet,
  user_agent text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_workspace_created_idx
  ON audit_logs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_document_idx
  ON audit_logs (document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outbox_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  job_type text NOT NULL
    CHECK (job_type IN ('send_email', 'sync_sheet', 'upload_drive', 'render_document', 'reconcile')),
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts > 0),
  next_attempt_at timestamptz NOT NULL DEFAULT NOW(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbox_jobs_pending_idx
  ON outbox_jobs (status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed');

DROP TRIGGER IF EXISTS signers_set_updated_at ON signers;
CREATE TRIGGER signers_set_updated_at
BEFORE UPDATE ON signers
FOR EACH ROW EXECUTE FUNCTION seg_kip_set_updated_at();

DROP TRIGGER IF EXISTS documents_set_updated_at ON documents;
CREATE TRIGGER documents_set_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION seg_kip_set_updated_at();

DROP TRIGGER IF EXISTS approvals_set_updated_at ON approvals;
CREATE TRIGGER approvals_set_updated_at
BEFORE UPDATE ON approvals
FOR EACH ROW EXECUTE FUNCTION seg_kip_set_updated_at();

DROP TRIGGER IF EXISTS outbox_jobs_set_updated_at ON outbox_jobs;
CREATE TRIGGER outbox_jobs_set_updated_at
BEFORE UPDATE ON outbox_jobs
FOR EACH ROW EXECUTE FUNCTION seg_kip_set_updated_at();

COMMIT;
