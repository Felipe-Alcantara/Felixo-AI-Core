-- Adds the two drawing node types already exposed by CanvasNodeType.
-- Without this migration a drawing worked until restart because the SQLite
-- CHECK constraint rejected its best-effort save.

CREATE TABLE canvas_nodes_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('terminal', 'note', 'group', 'file', 'webpage', 'notionTasks', 'drawing', 'excalidrawDrawing')),
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
