CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS signers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  position text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  signature_file_id text,
  signature_url text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE signers ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE signers ADD COLUMN IF NOT EXISTS position text NOT NULL DEFAULT '';
ALTER TABLE signers ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';
ALTER TABLE signers ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE signers ADD COLUMN IF NOT EXISTS signature_file_id text;
ALTER TABLE signers ADD COLUMN IF NOT EXISTS signature_url text;
ALTER TABLE signers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE signers ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);
ALTER TABLE signers ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id);
ALTER TABLE signers ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT NOW();
ALTER TABLE signers ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_signers_workspace_status
  ON signers (workspace_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_signers_workspace_email_active
  ON signers (workspace_id, lower(email))
  WHERE status <> 'deleted' AND workspace_id IS NOT NULL AND email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_signers_workspace_name_position_active
  ON signers (workspace_id, lower(full_name), lower(position))
  WHERE status <> 'deleted' AND workspace_id IS NOT NULL AND full_name <> '' AND position <> '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signers_status_check'
  ) THEN
    ALTER TABLE signers
      ADD CONSTRAINT signers_status_check
      CHECK (status IN ('active', 'inactive', 'deleted'));
  END IF;
END $$;
