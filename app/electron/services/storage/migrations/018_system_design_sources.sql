-- Um índice de documentos POR FONTE do System Design (08/10/2026).
--
-- Antes havia uma fonte por instalação e uma tabela só
-- (`system_design_documents`, chave = caminho). Com a lista de guias por
-- camada (usuário e projeto), o mesmo caminho existe em mais de uma fonte:
-- a chave passa a ser (fonte, caminho). A tabela antiga fica para a migração
-- dos documentos já sincronizados, feita na primeira leitura da config (o
-- SQL não sabe de qual fonte eles vieram); depois disso ela é esvaziada.
CREATE TABLE system_design_source_documents (
  source_key TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  source_sha TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source_key, path)
);

CREATE INDEX idx_system_design_source_documents_source
  ON system_design_source_documents(source_key, updated_at);
