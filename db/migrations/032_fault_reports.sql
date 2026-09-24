CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fault_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period_year smallint NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  period_month smallint NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  source_sheet_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'completed', 'archived')),
  rows_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  signer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_pdf jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_fault_reports_workspace_period
  ON fault_reports (workspace_id, period_year DESC, period_month DESC);

CREATE INDEX IF NOT EXISTS idx_fault_reports_workspace_status
  ON fault_reports (workspace_id, status, updated_at DESC);

DROP TRIGGER IF EXISTS fault_reports_set_updated_at ON fault_reports;
CREATE TRIGGER fault_reports_set_updated_at
BEFORE UPDATE ON fault_reports
FOR EACH ROW EXECUTE FUNCTION seg_kip_set_updated_at();
