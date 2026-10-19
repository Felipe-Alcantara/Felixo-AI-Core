-- Adds the `claude-api` node type (conversation block of a Claude account
-- that signs in with an API key).
-- Without this migration the block would work until restart because the SQLite
-- CHECK constraint on `type` rejects its best-effort save and it vanishes from
-- the canvas the next time the app opens. Same table rebuild as 013: SQLite
-- cannot alter a CHECK in place, and every existing row is copied unchanged.

CREATE TABLE canvas_nodes_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('terminal', 'note', 'group', 'file', 'webpage', 'notionTasks', 'drawing', 'excalidrawDrawing', 'cloud-session', 'claude-api')),
  parent_id TEXT,
  position_x REAL NOT NULL DEFAULT 0,
  position_y REAL NOT NULL DEFAULT 0,
  width REAL,
  height REAL,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

INSERT INTO canvas_nodes_new (
  id, type, parent_id, position_x, position_y, width, height,
  data_json, created_at, updated_at, archived_at
)
SELECT
  id, type, parent_id, position_x, position_y, width, height,
  data_json, created_at, updated_at, archived_at
FROM canvas_nodes;

DROP TABLE canvas_nodes;

ALTER TABLE canvas_nodes_new RENAME TO canvas_nodes;

CREATE INDEX idx_canvas_nodes_updated
  ON canvas_nodes(updated_at);
