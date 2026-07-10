CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE OR REPLACE FUNCTION seg_kip_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 2 AND 200),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  platform_role text NOT NULL DEFAULT 'user'
    CHECK (platform_role IN ('super_admin', 'user')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'pending')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 200),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  spreadsheet_id text NOT NULL CHECK (char_length(trim(spreadsheet_id)) >= 20),
  spreadsheet_url text NOT NULL,
  main_sheet_name text NOT NULL,
  drive_folder_id text,
  time_zone text NOT NULL DEFAULT 'Asia/Tashkent',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'disabled', 'archived')),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_single_default_idx
  ON workspaces (is_default)
  WHERE is_default = true;

CREATE TABLE IF NOT EXISTS workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL
    CHECK (role IN ('owner', 'administrator', 'operator', 'engineer', 'department_manager', 'viewer')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'invited')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS refresh_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  family_id uuid NOT NULL,
  user_agent text,
  ip_address inet,
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workspace_members_user_idx
  ON workspace_members (user_id, status);
CREATE INDEX IF NOT EXISTS refresh_sessions_user_idx
  ON refresh_sessions (user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS refresh_sessions_family_idx
  ON refresh_sessions (family_id);

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION seg_kip_set_updated_at();

DROP TRIGGER IF EXISTS workspaces_set_updated_at ON workspaces;
CREATE TRIGGER workspaces_set_updated_at
BEFORE UPDATE ON workspaces
FOR EACH ROW EXECUTE FUNCTION seg_kip_set_updated_at();

DROP TRIGGER IF EXISTS workspace_members_set_updated_at ON workspace_members;
CREATE TRIGGER workspace_members_set_updated_at
BEFORE UPDATE ON workspace_members
FOR EACH ROW EXECUTE FUNCTION seg_kip_set_updated_at();
