ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS personal_drive_apps_script_url text,
  ADD COLUMN IF NOT EXISTS personal_drive_secret_encrypted text;
