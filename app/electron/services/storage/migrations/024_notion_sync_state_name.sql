-- Nome da database junto do snapshot, para listar as databases com cache quando
-- o Notion não responde (sem isto a lista offline não teria como se rotular).
ALTER TABLE notion_sync_state ADD COLUMN name TEXT;
