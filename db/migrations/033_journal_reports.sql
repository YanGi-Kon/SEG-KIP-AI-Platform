CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS journal_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period_year smallint NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  period_month smallint NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  source_sheet_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'completed', 'archived')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, period_year, period_month)
);

CREATE TABLE IF NOT EXISTS journal_report_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES journal_reports(id) ON DELETE CASCADE,
  document_date date NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_report_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES journal_reports(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES journal_report_batches(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  source_row_number integer,
  date_text text NOT NULL DEFAULT '',
  position_no text NOT NULL DEFAULT '',
  equipment_name text NOT NULL DEFAULT '',
  brand text NOT NULL DEFAULT '',
  serial_no text NOT NULL DEFAULT '',
  measure_range text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  skv text NOT NULL DEFAULT '',
  work_type text NOT NULL DEFAULT '',
  executor text NOT NULL DEFAULT '',
  signature text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_journal_reports_workspace_period
  ON journal_reports (workspace_id, period_year DESC, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_journal_report_batches_report
  ON journal_report_batches (report_id, document_date, created_at);
CREATE INDEX IF NOT EXISTS idx_journal_report_items_report
  ON journal_report_items (report_id, created_at);

DROP TRIGGER IF EXISTS journal_reports_set_updated_at ON journal_reports;
CREATE TRIGGER journal_reports_set_updated_at
BEFORE UPDATE ON journal_reports
FOR EACH ROW EXECUTE FUNCTION seg_kip_set_updated_at();
