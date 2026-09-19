-- Modo fast do Codex (`service_tier = "priority"`) como propriedade do modelo
-- de chat. Coluna própria, com default 0: modelos já salvos continuam sem fast,
-- e uma instalação antiga só ganha a coluna na atualização.

ALTER TABLE models ADD COLUMN fast_mode INTEGER NOT NULL DEFAULT 0;
