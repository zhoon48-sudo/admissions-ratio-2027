CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO system_settings(setting_key, setting_value)
VALUES ('report_time', '16:00');

CREATE TABLE IF NOT EXISTS report_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_key TEXT NOT NULL UNIQUE,
  report_date TEXT NOT NULL,
  kind TEXT NOT NULL,
  day_no INTEGER,
  report_time TEXT,
  created_at TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS report_snapshot_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  university_name TEXT NOT NULL,
  snapshot_id INTEGER NOT NULL,
  applied_time TEXT,
  source_collected_at TEXT,
  UNIQUE(report_id, university_name),
  FOREIGN KEY (report_id) REFERENCES report_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES competition_snapshots(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_report_date
  ON report_snapshots(report_date, kind);

CREATE INDEX IF NOT EXISTS idx_report_items_report
  ON report_snapshot_items(report_id);

CREATE INDEX IF NOT EXISTS idx_snapshots_name_time_status
  ON competition_snapshots(university_name, collected_at, status);
