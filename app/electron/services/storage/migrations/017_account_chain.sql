-- Cadeia de contas (docs/projeto/POLITICA-CONTAS.md). Só acrescenta tabelas:
-- uma versão anterior do app ignora todas elas, então voltar de versão é
-- seguro. O `cli-accounts.json` não muda de formato; os ids de conta daqui são
-- os mesmos do perfil, como `agent_usage_accounts` já faz.
--
-- Estado de decisão (proposta, ticket, espera) mora só aqui, com
-- compare-and-set pela coluna `revision`: dois Felixo no mesmo perfil nunca
-- aplicam a mesma transição duas vezes (ver account-chain-repository.cjs).

-- Ausência da linha = cadeia DESLIGADA (padrão ao instalar e ao atualizar).
-- A revisão desta linha guarda também a lista de membros.
CREATE TABLE account_chain_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  strategy TEXT NOT NULL DEFAULT 'manual'
    CHECK (strategy IN ('manual', 'round_robin', 'most_capacity', 'subscription_first')),
  max_hops_per_lineage INTEGER NOT NULL DEFAULT 3 CHECK (max_hops_per_lineage BETWEEN 1 AND 10),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

-- Lista global ordenada (pode cruzar provedores). Sem índice único em
-- position: a lista é regravada inteira numa transação guardada pela revisão
-- de settings, e UPDATEs sequenciais de reordenação colidiriam num único.
CREATE TABLE account_chain_members (
  account_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL CHECK (provider_id IN ('codex', 'claude', 'gemini', 'openia')),
  position INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  billing_declared TEXT CHECK (billing_declared IN ('assinatura', 'uso')),
  multiplier_declared REAL CHECK (multiplier_declared IS NULL OR (multiplier_declared >= 1 AND multiplier_declared <= 100)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_account_chain_members_position ON account_chain_members(position);

-- Espera atual por conta. A liberação fica registrada na própria linha.
CREATE TABLE account_cooldowns (
  account_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  failure_class TEXT NOT NULL CHECK (failure_class IN ('limit', 'auth', 'billing')),
  detected_at TEXT NOT NULL,
  until_at TEXT,                          -- NULL = até checagem/ação (auth, billing)
  until_source TEXT NOT NULL CHECK (until_source IN ('medicao', 'texto', 'texto_fuso_local', 'padrao', 'checagem')),
  evidence TEXT CHECK (evidence IS NULL OR length(evidence) <= 200),   -- já redigida
  evidence_hash TEXT,
  session_id TEXT,
  released_at TEXT,
  released_by TEXT CHECK (released_by IN ('vencimento', 'checagem', 'nao_era_limite', 'recarregou', 'manual')),
  revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE account_login_checks (
  account_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('logged_in', 'logged_out', 'unknown', 'cli_ausente', 'tempo_esgotado', 'erro', 'sem_checagem')),
  checked_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('checagem', 'amostra_do_painel')),
  duration_ms INTEGER,
  method TEXT,                            -- texto que a CLI imprimiu, redigido
  plan TEXT,                              -- idem
  billing_detected TEXT CHECK (billing_detected IN ('assinatura', 'uso')),
  api_key_source_present INTEGER NOT NULL DEFAULT 0 CHECK (api_key_source_present IN (0, 1)),
  multiplier_detected REAL,
  identity_key TEXT,                      -- fingerprint, nunca e-mail ou token
  identity_status TEXT CHECK (identity_status IN ('matched', 'unbound', 'different', 'duplicate', 'missing'))
);

-- Registro de trocas: nunca guarda transcript, env, caminho de perfil ou segredo.
-- `provider_switch` (decisões do orquestrador) usa accepted/refused; `notice`
-- (bloco fixo, Login do sistema ou cadeia desligada) usa noticed. Assim toda
-- troca, de qualquer origem, tem motivo e horário.
CREATE TABLE account_switch_events (
  id TEXT PRIMARY KEY,                    -- uuid do main = chave de idempotência = ticket
  kind TEXT NOT NULL CHECK (kind IN ('continuation', 'launch', 'manual', 'notice', 'provider_switch')),
  state TEXT NOT NULL CHECK (state IN ('noticed', 'proposed', 'confirmed', 'spawning', 'spawned',
    'declined', 'dismissed', 'expired', 'superseded', 'spawn_failed', 'no_candidate', 'accepted', 'refused')),
  source_session_id TEXT,
  source_node_id TEXT,
  lineage_id TEXT,
  hop INTEGER NOT NULL DEFAULT 0,
  incident_key TEXT,                      -- account_id + detected_at da espera: agrupa sessões da mesma conta
  from_account_id TEXT,
  from_provider_id TEXT NOT NULL,
  from_label TEXT,
  to_account_id TEXT,
  to_provider_id TEXT,
  to_label TEXT,                          -- rótulos como fotografia do momento
  failure_class TEXT,
  reason TEXT NOT NULL CHECK (length(reason) <= 400),        -- redigido
  evidence_hash TEXT,
  strategy TEXT,
  chosen_by TEXT CHECK (chosen_by IN ('chain', 'person')),
  candidates_json TEXT NOT NULL DEFAULT '[]',                -- ids + motivo de exclusão; sem segredo
  source_active_ack INTEGER NOT NULL DEFAULT 0 CHECK (source_active_ack IN (0, 1)),
  source_auto_resume_at TEXT,             -- Claude "continuing automatically at …"
  transcript_chars INTEGER,
  post_switch_failure TEXT,               -- classe de falha vista no bloco novo logo após nascer
  detected_at TEXT,
  proposed_at TEXT NOT NULL,
  decided_at TEXT,
  spawned_at TEXT,
  expires_at TEXT NOT NULL,
  target_session_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_switch_state_expires ON account_switch_events(state, expires_at);
CREATE INDEX idx_switch_lineage ON account_switch_events(lineage_id, proposed_at);
CREATE INDEX idx_switch_proposed ON account_switch_events(proposed_at DESC);
-- I1 no próprio banco: no máximo UMA proposta aberta por sessão de origem.
CREATE UNIQUE INDEX idx_switch_one_open_per_session
  ON account_switch_events(source_session_id)
  WHERE state IN ('proposed', 'confirmed', 'spawning') AND source_session_id IS NOT NULL;
