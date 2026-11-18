-- Registro de uso: uma linha por sessão de agente e uma por interação (Enter da pessoa).
-- Só metadados: nunca o texto digitado, token ou caminho completo da pasta.
CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,
  pty_session_id TEXT NOT NULL,
  agent TEXT,
  provider_id TEXT,
  model TEXT,
  effort TEXT,
  fast INTEGER NOT NULL DEFAULT 0,
  account_id TEXT,
  project TEXT,
  cli_session_ref TEXT,
  user_id TEXT NOT NULL DEFAULT 'local',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  -- exit | killed | app_closed (o app fechou ou caiu com a sessão aberta)
  ended_reason TEXT,
  -- modelo e esforço são os do launch; a pessoa pode trocá-los dentro da CLI
  settings_from_launch INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_agent_sessions_started ON agent_sessions(started_at);
CREATE INDEX idx_agent_sessions_open ON agent_sessions(ended_at) WHERE ended_at IS NULL;

CREATE TABLE agent_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'manual',
  chars INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_agent_interactions_session ON agent_interactions(session_id, at);
