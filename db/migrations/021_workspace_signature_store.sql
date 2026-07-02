CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS workspace_signature_store (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  file_name text NOT NULL DEFAULT 'signature.png',
  mime_type text NOT NULL DEFAULT 'image/png',
  image_base64 text NOT NULL,
  image_sha256 text NOT NULL,
  size_bytes integer NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_signature_store_workspace_created
  ON workspace_signature_store (workspace_id, created_at DESC);
