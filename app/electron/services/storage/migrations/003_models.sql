CREATE TABLE models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  source TEXT NOT NULL,
  cli_type TEXT NOT NULL,
  provider_model TEXT,
  reasoning_effort TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX idx_models_cli_type_updated
  ON models(cli_type, updated_at);
