export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'init',
    sql: `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('VIEWER','OPERATOR','MANAGER','ADMIN','OWNER')),
  is_active INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);

CREATE TABLE inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode TEXT NOT NULL UNIQUE,
  model TEXT,
  brand TEXT,
  status TEXT,
  stock_age INTEGER,
  age_bucket TEXT,
  priority TEXT,
  status_bucket TEXT,
  location TEXT,
  bin_bucket TEXT,
  source_type TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  details TEXT,
  ip TEXT
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_inventory_barcode ON inventory(barcode);
CREATE INDEX idx_inventory_status ON inventory(status);
CREATE INDEX idx_inventory_age_bucket ON inventory(age_bucket);
CREATE INDEX idx_inventory_status_bucket ON inventory(status_bucket);
CREATE INDEX idx_inventory_location ON inventory(location);
CREATE INDEX idx_inventory_updated_at ON inventory(updated_at);
CREATE INDEX idx_audit_log_at ON audit_log(at);
`
  },
  {
    version: 2,
    name: 'pipeline',
    sql: `
CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  source_type TEXT NOT NULL CHECK (source_type IN ('QC_STOCK','TRC','INVENTORY','LOCATION','OTHER')),
  sheet_name TEXT,
  join_key TEXT NOT NULL DEFAULT 'barcode',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE field_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  source_column TEXT NOT NULL,
  target_field TEXT NOT NULL,
  is_required INTEGER NOT NULL DEFAULT 0,
  output_order INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (source_id, source_column)
);

CREATE TABLE age_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  min_age INTEGER NOT NULL,
  max_age INTEGER NOT NULL,
  bucket TEXT NOT NULL,
  priority TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE status_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_status TEXT NOT NULL UNIQUE COLLATE NOCASE,
  bucket TEXT NOT NULL,
  marking TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE location_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL,
  bucket TEXT NOT NULL,
  condition TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE priority_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field TEXT NOT NULL,
  source_type TEXT NOT NULL,
  rank INTEGER NOT NULL,
  UNIQUE (field, source_type)
);

CREATE TABLE import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('SINGLE','MULTI')),
  source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('UPLOADED','COMPLETE','PARTIAL_FAILURE','DISCARDED')),
  filename TEXT,
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_ok INTEGER NOT NULL DEFAULT 0,
  rows_failed INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE import_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  barcode TEXT,
  mapped_json TEXT,
  error TEXT
);

CREATE TABLE import_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  barcode TEXT,
  field TEXT,
  message TEXT NOT NULL
);

CREATE TABLE data_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode TEXT NOT NULL,
  field TEXT NOT NULL,
  source_a TEXT NOT NULL,
  value_a TEXT,
  source_b TEXT NOT NULL,
  value_b TEXT,
  final_value TEXT,
  rule TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE report_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  config_json TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL CHECK (type IN ('AGE_OVER','STATUS_BUCKET_COUNT','MISSING_FIELD')),
  threshold_value INTEGER NOT NULL,
  filters_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_fired_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_sources_name ON sources(name);
CREATE INDEX idx_field_mappings_source ON field_mappings(source_id);
CREATE INDEX idx_age_rules_range ON age_rules(min_age, max_age);
CREATE INDEX idx_import_jobs_created ON import_jobs(created_at);
CREATE INDEX idx_import_rows_job ON import_rows(job_id);
CREATE INDEX idx_import_errors_job ON import_errors(job_id);
CREATE INDEX idx_conflicts_barcode ON data_conflicts(barcode);
CREATE INDEX idx_alerts_active ON alerts(is_active);
`
  },
  {
    version: 3,
    name: 'panel_bridge',
    sql: `
CREATE TABLE import_files (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  headers_json TEXT NOT NULL,
  rows_json TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_import_files_created ON import_files(created_at);
`
  }
];
