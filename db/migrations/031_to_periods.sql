CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS to_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period_year smallint NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  period_month smallint NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  document_date date NOT NULL,
  source_sheet_name text NOT NULL,
  monthly_sheet_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'completed', 'archived')),
  conclusion text NOT NULL DEFAULT 'Заключение: оборудование исправно и пригодно к эксплуатации',
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  kip_master_signer_id uuid REFERENCES workspace_signers(id) ON DELETE SET NULL,
  kip_master_position_snapshot text,
  kip_master_fio_snapshot text,
  kip_master_signature_file_id_snapshot text,
  kip_master_signature_url_snapshot text,
  sync_status text NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'synced', 'error')),
  sync_error text,
  last_sheet_sync_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_to_periods_workspace_period
  ON to_periods (workspace_id, period_year DESC, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_to_periods_workspace_status
  ON to_periods (workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS to_period_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES to_periods(id) ON DELETE CASCADE,
  source_row_number integer NOT NULL CHECK (source_row_number > 0),
  section_name text NOT NULL DEFAULT 'ASOSIY',
  no text NOT NULL DEFAULT '',
  serial_no text NOT NULL DEFAULT '',
  equipment_name text NOT NULL DEFAULT '',
  position_no text NOT NULL DEFAULT '',
  quantity text NOT NULL DEFAULT '',
  technical_state text NOT NULL DEFAULT '',
  work_type text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (period_id, source_row_number)
);

CREATE INDEX IF NOT EXISTS idx_to_period_items_period_row
  ON to_period_items (period_id, source_row_number);

DROP TRIGGER IF EXISTS to_periods_set_updated_at ON to_periods;
CREATE TRIGGER to_periods_set_updated_at
BEFORE UPDATE ON to_periods
FOR EACH ROW EXECUTE FUNCTION seg_kip_set_updated_at();

DROP TRIGGER IF EXISTS to_period_items_set_updated_at ON to_period_items;
CREATE TRIGGER to_period_items_set_updated_at
BEFORE UPDATE ON to_period_items
FOR EACH ROW EXECUTE FUNCTION seg_kip_set_updated_at();
