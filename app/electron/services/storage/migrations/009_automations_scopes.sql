-- Alinha o CHECK de `scope` aos sete topicos que a interface sempre ofereceu.
--
-- A tabela nasceu em 002 aceitando cinco: 'notion' e 'security' eram recusados
-- aqui, embora o seletor os mostrasse. Um prompt salvo nesses topicos sumia —
-- e como tres presets embutidos usam 'notion' e dois usam 'security', editar
-- qualquer um deles nunca persistia.
--
-- SQLite nao faz ALTER de constraint: e preciso criar a tabela nova, copiar as
-- linhas, apagar a antiga e renomear. O indice tambem cai junto com a tabela e
-- precisa ser recriado.

CREATE TABLE automations_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (
    scope IN ('chat', 'code', 'docs', 'git', 'notion', 'planning', 'security')
  ),
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

INSERT INTO automations_new (
  id, name, description, prompt, scope, is_default, created_at, updated_at, archived_at
)
SELECT
  id, name, description, prompt, scope, is_default, created_at, updated_at, archived_at
FROM automations;

DROP TABLE automations;

ALTER TABLE automations_new RENAME TO automations;

CREATE INDEX idx_automations_scope_updated
  ON automations(scope, updated_at);
