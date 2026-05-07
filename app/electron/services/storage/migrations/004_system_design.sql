CREATE TABLE system_design_documents (
  path TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  source_sha TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_system_design_documents_updated
  ON system_design_documents(updated_at);
