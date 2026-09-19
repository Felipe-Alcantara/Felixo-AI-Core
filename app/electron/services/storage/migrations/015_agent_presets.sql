-- Presets de agente: receita salva (CLI, modelo, esforço, fast, contexto,
-- skills, pasta). O formato interno (versionado) vive em `data_json`; nome e
-- id ficam em colunas próprias para listar e ordenar sem abrir o JSON.
-- Soft-delete por `archived_at`, como models e canvas_nodes.

CREATE TABLE agent_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
