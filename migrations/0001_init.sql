PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS universities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  agency TEXT NOT NULL,
  source_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  ok_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

CREATE TABLE IF NOT EXISTS competition_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  university_name TEXT NOT NULL,
  agency TEXT NOT NULL,
  parser TEXT,
  status TEXT NOT NULL,
  inner_quota INTEGER,
  inner_apply INTEGER,
  inner_rate REAL,
  outside_quota INTEGER,
  outside_apply INTEGER,
  outside_rate REAL,
  total_quota INTEGER,
  total_apply INTEGER,
  total_rate REAL,
  excluded_note TEXT,
  warning_note TEXT,
  source_url TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES crawl_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_snapshots_university_time
  ON competition_snapshots(university_name, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_run
  ON competition_snapshots(run_id);

CREATE INDEX IF NOT EXISTS idx_runs_started
  ON crawl_runs(started_at DESC);

INSERT OR IGNORE INTO universities (name, agency, source_url, sort_order) VALUES
('경성대학교','UWAY','https://ratio.uwayapply.com/Sl5KJjlKZiUmOiZKN2ZUZg==',1),
('동아대학교','JINHAK','https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10591481.html',2),
('동의대학교','UWAY','https://ratio.uwayapply.com/Sl5KOmBWSmYlJjomSjdmVGY=',3),
('동서대학교','JINHAK','https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10570791.html',4),
('동명대학교','JINHAK','https://addon.jinhakapply.com/RatioV1/RatioH/Ratio30050681.html',5),
('부산외국어대학교','JINHAK','https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10750521.html',6),
('신라대학교','JINHAK','https://addon.jinhakapply.com/RatioV1/RatioH/Ratio11020621.html',7),
('고신대학교','UWAY','https://ratio.uwayapply.com/Sl5KVyUmYTlKZiUmOiZKN2ZUZg==',8),
('부산가톨릭대학교','JINHAK','https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10730551.html',9),
('부산대학교','JINHAK','https://addon.jinhakapply.com/RatioV1/RatioH/Ratio12100661.html',10),
('부경대학교','JINHAK','https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10720401.html',11),
('한국해양대학교','UWAY','https://ratio.uwayapply.com/Sl5KOmFNOUpmJSY6Jko3ZlRm',12),
('울산대학교','UWAY','https://ratio.uwayapply.com/Sl5KVzgmQzpKZiUmOiZKN2ZUZg==',13),
('경남대학교','JINHAK','https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10130591.html',14),
('인제대학교','UWAY','https://ratio.uwayapply.com/Sl5KYC9XJUpmJSY6Jko3ZlRm',15),
('영산대학교','JINHAK','https://addon.jinhakapply.com/RatioV1/RatioH/Ratio30100311.html',16),
('경상국립대학교','JINHAK','https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10171011.html',17),
('창원대학교','JINHAK','https://addon.jinhakapply.com/RatioV1/RatioH/Ratio11350621.html',18);
