CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE UNIQUE INDEX idx_projects_path_unique
  ON projects(path);

CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX idx_chats_project_updated
  ON chats(project_id, updated_at);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  model_id TEXT,
  thread_id TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('streaming', 'done', 'error', 'archived')),
  storage_tier TEXT NOT NULL DEFAULT 'hot' CHECK (storage_tier IN ('hot', 'warm', 'cold')),
  usefulness_score REAL NOT NULL DEFAULT 0,
  use_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  archived_at TEXT
);

CREATE INDEX idx_messages_chat_created
  ON messages(chat_id, created_at);

CREATE INDEX idx_messages_tier_score
  ON messages(storage_tier, usefulness_score, last_used_at);

CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  parent_thread_id TEXT REFERENCES threads(id) ON DELETE SET NULL,
  cli_type TEXT NOT NULL,
  model_id TEXT,
  provider_session_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  prompt_hint TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX idx_threads_chat_status
  ON threads(chat_id, status);

CREATE TABLE terminal_events (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  event_type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_terminal_events_thread_created
  ON terminal_events(thread_id, created_at);

CREATE TABLE agent_results (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  cli_type TEXT NOT NULL,
  model_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'canceled')),
  prompt TEXT NOT NULL,
  result TEXT,
  error TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_agent_results_thread_status
  ON agent_results(thread_id, status);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  chat_id TEXT REFERENCES chats(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX idx_notes_project_updated
  ON notes(project_id, updated_at);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE memory_items (
  id TEXT PRIMARY KEY,
  source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  chat_id TEXT REFERENCES chats(id) ON DELETE SET NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'project', 'repo', 'chat', 'agent')),
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'preference', 'decision', 'task', 'insight', 'warning')),
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'approved', 'rejected', 'auto')),
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0,
  usefulness_score REAL NOT NULL DEFAULT 0,
  use_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX idx_memory_items_scope_status_score
  ON memory_items(scope, status, usefulness_score, last_used_at);

CREATE TABLE conversation_summaries (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  range_start_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  range_end_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  token_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_conversation_summaries_chat_created
  ON conversation_summaries(chat_id, created_at);

CREATE TABLE message_archives (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  range_start_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  range_end_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  compression_method TEXT NOT NULL,
  original_size INTEGER NOT NULL,
  compressed_size INTEGER NOT NULL,
  compressed_blob BLOB NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_message_archives_chat_created
  ON message_archives(chat_id, created_at);
