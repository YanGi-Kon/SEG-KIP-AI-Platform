CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key VARCHAR(255) PRIMARY KEY,
  setting_value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default backup schedule if not exists
INSERT INTO platform_settings (setting_key, setting_value)
VALUES ('backup_schedule', '{"times": ["00:00", "12:00"]}')
ON CONFLICT (setting_key) DO NOTHING;
