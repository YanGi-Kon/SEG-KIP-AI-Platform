ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS final_documents_folder_id text;
