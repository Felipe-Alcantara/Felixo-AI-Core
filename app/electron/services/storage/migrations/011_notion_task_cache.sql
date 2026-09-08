-- Cache local das tabelas Notion. O token vive fora do SQLite, cifrado pelo
-- safeStorage; estas tabelas guardam somente metadados e uma cópia normalizada
-- das tarefas para leitura offline/stale-while-revalidate.
CREATE TABLE notion_task_cache (
  connection_id TEXT NOT NULL,
  data_source_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, data_source_id, task_id)
);

CREATE INDEX idx_notion_task_cache_fetched
  ON notion_task_cache(connection_id, data_source_id, fetched_at DESC);

CREATE TABLE notion_sync_state (
  connection_id TEXT NOT NULL,
  data_source_id TEXT NOT NULL,
  schema_json TEXT NOT NULL DEFAULT '{}',
  next_cursor TEXT,
  fetched_at TEXT,
  last_success_at TEXT,
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'syncing', 'success', 'stale', 'error')),
  last_error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, data_source_id)
);

CREATE INDEX idx_notion_sync_state_status
  ON notion_sync_state(status, updated_at DESC);
