ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS service_account_encrypted_json text,
  ADD COLUMN IF NOT EXISTS service_account_client_email text,
  ADD COLUMN IF NOT EXISTS service_account_project_id text,
  ADD COLUMN IF NOT EXISTS service_account_status text NOT NULL DEFAULT 'missing'
    CHECK (service_account_status IN ('missing', 'configured', 'invalid')),
  ADD COLUMN IF NOT EXISTS service_account_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS workspaces_service_account_status_idx
  ON workspaces (service_account_status);
