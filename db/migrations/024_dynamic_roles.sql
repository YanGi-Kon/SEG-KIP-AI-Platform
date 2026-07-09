CREATE TABLE IF NOT EXISTS system_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(trim(name)) BETWEEN 2 AND 100),
  permissions jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS system_roles_set_updated_at ON system_roles;
CREATE TRIGGER system_roles_set_updated_at
BEFORE UPDATE ON system_roles
FOR EACH ROW EXECUTE FUNCTION seg_kip_set_updated_at();

ALTER TABLE users ADD COLUMN IF NOT EXISTS system_role_id uuid REFERENCES system_roles(id);

INSERT INTO system_roles (id, name, permissions) 
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'Super Admin', '["*"]'),
  ('00000000-0000-0000-0000-000000000002', 'User', '[]')
ON CONFLICT DO NOTHING;

UPDATE users SET system_role_id = '00000000-0000-0000-0000-000000000001' WHERE platform_role = 'super_admin' AND system_role_id IS NULL;
UPDATE users SET system_role_id = '00000000-0000-0000-0000-000000000002' WHERE platform_role = 'user' AND system_role_id IS NULL;

-- If there are any other users, set them to User
UPDATE users SET system_role_id = '00000000-0000-0000-0000-000000000002' WHERE system_role_id IS NULL;

ALTER TABLE users ALTER COLUMN system_role_id SET NOT NULL;
ALTER TABLE users DROP COLUMN platform_role;
