CREATE TABLE automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('chat', 'code', 'docs', 'git', 'planning')),
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX idx_automations_scope_updated
  ON automations(scope, updated_at);
