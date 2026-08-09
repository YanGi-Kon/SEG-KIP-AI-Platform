ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS module_settings JSONB DEFAULT '{}';
