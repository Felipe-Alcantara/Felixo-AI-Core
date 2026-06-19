-- Adds the 'group' node type and a parent reference so nodes can live inside
-- a group (subflow). SQLite can't alter a CHECK constraint in place, so the
-- table is recreated and existing rows are copied over.

CREATE TABLE canvas_nodes_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('terminal', 'note', 'group')),
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
  id, type, NULL, position_x, position_y, width, height,
  data_json, created_at, updated_at, archived_at
FROM canvas_nodes;

DROP TABLE canvas_nodes;

ALTER TABLE canvas_nodes_new RENAME TO canvas_nodes;

CREATE INDEX idx_canvas_nodes_updated
  ON canvas_nodes(updated_at);
