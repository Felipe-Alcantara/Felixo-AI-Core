CREATE TABLE agent_usage_accounts (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  label TEXT NOT NULL,
  identity_key TEXT,
  identity_display TEXT,
  identity_source TEXT CHECK (identity_source IN ('cli', 'manual')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX idx_agent_usage_accounts_provider
  ON agent_usage_accounts(provider_id, archived_at, updated_at);

CREATE UNIQUE INDEX idx_agent_usage_accounts_identity
  ON agent_usage_accounts(provider_id, identity_key)
  WHERE identity_key IS NOT NULL AND archived_at IS NULL;

CREATE TABLE agent_usage_samples (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES agent_usage_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('current', 'stale', 'unavailable', 'error')),
  source_kind TEXT NOT NULL,
  source_label TEXT NOT NULL,
  source_command TEXT,
  source_url TEXT,
  collected_at TEXT NOT NULL,
  metrics_json TEXT NOT NULL DEFAULT '[]',
  observed_identity_key TEXT,
  observed_identity_display TEXT,
  error_message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_agent_usage_samples_account_collected
  ON agent_usage_samples(account_id, collected_at DESC);

CREATE INDEX idx_agent_usage_samples_status
  ON agent_usage_samples(status, collected_at DESC);
