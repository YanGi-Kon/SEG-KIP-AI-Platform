-- Drop the system_roles table and related columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_role text DEFAULT 'user' 
  CHECK (platform_role IN ('super_admin', 'admin', 'user'));

-- Map existing users back to platform_role based on system_role_id
-- We know '00000000-0000-0000-0000-000000000001' was Super Admin
UPDATE users SET platform_role = 'super_admin' WHERE system_role_id = '00000000-0000-0000-0000-000000000001';
UPDATE users SET platform_role = 'user' WHERE system_role_id != '00000000-0000-0000-0000-000000000001';

ALTER TABLE users ALTER COLUMN platform_role SET NOT NULL;
ALTER TABLE users DROP COLUMN IF EXISTS system_role_id;

DROP TABLE IF EXISTS system_roles CASCADE;

-- Remap workspace_members roles
UPDATE workspace_members SET role = 'administrator' WHERE role = 'workspace_manager';
UPDATE workspace_members SET role = 'operator' WHERE role IN ('engineer', 'department_manager');

-- Drop old check constraint on workspace_members role
ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;

-- Add the new check constraint for the 4 roles
ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_role_check 
  CHECK (role IN ('owner', 'administrator', 'operator', 'viewer'));
