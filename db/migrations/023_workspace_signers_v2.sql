CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS workspace_signers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
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

ALTER TABLE workspace_signers ADD COLUMN IF NOT EXISTS workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE workspace_signers ADD COLUMN IF NOT EXISTS position text NOT NULL DEFAULT '';
ALTER TABLE workspace_signers ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';
ALTER TABLE workspace_signers ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE workspace_signers ADD COLUMN IF NOT EXISTS signature_file_id text;
ALTER TABLE workspace_signers ADD COLUMN IF NOT EXISTS signature_url text;
ALTER TABLE workspace_signers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE workspace_signers ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);
ALTER TABLE workspace_signers ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id);
ALTER TABLE workspace_signers ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT NOW();
ALTER TABLE workspace_signers ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_workspace_signers_workspace_status
  ON workspace_signers (workspace_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_workspace_signers_email_active
  ON workspace_signers (workspace_id, lower(email))
  WHERE status <> 'deleted' AND email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_workspace_signers_name_position_active
  ON workspace_signers (workspace_id, lower(full_name), lower(position))
  WHERE status <> 'deleted' AND full_name <> '' AND position <> '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_signers_status_check'
  ) THEN
    ALTER TABLE workspace_signers
      ADD CONSTRAINT workspace_signers_status_check
      CHECK (status IN ('active', 'inactive', 'deleted'));
  END IF;
END $$;

DO $$
DECLARE
  has_legacy boolean;
  has_workspace_id boolean;
  has_position boolean;
  has_lavozimi boolean;
  has_full_name boolean;
  has_fio boolean;
  has_email boolean;
  has_gmail boolean;
  has_signature_file_id boolean;
  has_signature_url boolean;
  has_imzo_png boolean;
  has_status boolean;
  has_created_by boolean;
  has_updated_by boolean;
  has_created_at boolean;
  legacy_sql text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'signers'
  ) INTO has_legacy;

  IF NOT has_legacy THEN
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signers' AND column_name='workspace_id') INTO has_workspace_id;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signers' AND column_name='position') INTO has_position;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signers' AND column_name='lavozimi') INTO has_lavozimi;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signers' AND column_name='full_name') INTO has_full_name;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signers' AND column_name='fio') INTO has_fio;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signers' AND column_name='email') INTO has_email;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signers' AND column_name='gmail') INTO has_gmail;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signers' AND column_name='signature_file_id') INTO has_signature_file_id;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signers' AND column_name='signature_url') INTO has_signature_url;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signers' AND column_name='imzo_png') INTO has_imzo_png;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signers' AND column_name='status') INTO has_status;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signers' AND column_name='created_by') INTO has_created_by;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signers' AND column_name='updated_by') INTO has_updated_by;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signers' AND column_name='created_at') INTO has_created_at;

  IF NOT has_workspace_id THEN
    RETURN;
  END IF;

  legacy_sql := format($fmt$
    INSERT INTO workspace_signers (
      workspace_id, position, full_name, email, signature_file_id,
      signature_url, status, created_by, updated_by, created_at, updated_at
    )
    SELECT DISTINCT ON (workspace_id, lower(email), lower(full_name), lower(position))
      workspace_id,
      COALESCE(NULLIF(%1$s, ''), '') AS position,
      COALESCE(NULLIF(%2$s, ''), '') AS full_name,
      COALESCE(NULLIF(%3$s, ''), '') AS email,
      NULLIF(%4$s, '') AS signature_file_id,
      NULLIF(%5$s, '') AS signature_url,
      CASE WHEN %6$s IN ('active', 'inactive', 'deleted') THEN %6$s ELSE 'active' END AS status,
      %7$s AS created_by,
      %8$s AS updated_by,
      COALESCE(%9$s, NOW()) AS created_at,
      NOW() AS updated_at
    FROM signers
    WHERE workspace_id IS NOT NULL
      AND COALESCE(NULLIF(%2$s, ''), '') <> ''
      AND COALESCE(NULLIF(%3$s, ''), '') <> ''
    ORDER BY workspace_id, lower(email), lower(full_name), lower(position), COALESCE(%9$s, NOW()) DESC
    ON CONFLICT DO NOTHING
  $fmt$,
    CASE WHEN has_position THEN 'position' WHEN has_lavozimi THEN 'lavozimi' ELSE quote_literal('') END,
    CASE WHEN has_full_name THEN 'full_name' WHEN has_fio THEN 'fio' ELSE quote_literal('') END,
    CASE WHEN has_email THEN 'email' WHEN has_gmail THEN 'gmail' ELSE quote_literal('') END,
    CASE WHEN has_signature_file_id THEN 'signature_file_id' ELSE quote_literal('') END,
    CASE WHEN has_signature_url THEN 'signature_url' WHEN has_imzo_png THEN 'imzo_png' ELSE quote_literal('') END,
    CASE WHEN has_status THEN 'status' ELSE quote_literal('active') END,
    CASE WHEN has_created_by THEN 'created_by' ELSE 'NULL::uuid' END,
    CASE WHEN has_updated_by THEN 'updated_by' ELSE 'NULL::uuid' END,
    CASE WHEN has_created_at THEN 'created_at' ELSE 'NULL::timestamptz' END
  );

  EXECUTE legacy_sql;
END $$;
