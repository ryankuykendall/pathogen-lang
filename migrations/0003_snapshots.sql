-- Migration 0003: workspace snapshots
--
-- A snapshot is the rendered SVG of a workspace plus the exact code that drew
-- it, captured from the playground (docs/snapshots.md). The SVG, the code and
-- a small PNG card live in R2 under snapshots/{workspace_id}/{id}/; this
-- table holds the metadata the snapshots page lists and the per-account
-- quota counts. Snapshots are deleted with their workspace (deleteWorkspace
-- cascades), so workspace_id always refers to a live workspace.
--
-- n is the per-workspace sequence number shown as "#n" and used in the page
-- URL (/workspace/:slugId/snapshots/:n). Numbers are never reused while the
-- highest one exists; UNIQUE(workspace_id, n) makes a concurrent double-save
-- fail loudly instead of producing two "#7"s (the handler retries).
--
-- seed is reserved for a future seeded random(); always NULL today.

CREATE TABLE snapshots (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  workspace_id  TEXT NOT NULL,
  n             INTEGER NOT NULL,
  name          TEXT NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  width         REAL,
  height        REAL,
  background    TEXT,
  svg_bytes     INTEGER NOT NULL,
  code_bytes    INTEGER NOT NULL,
  seed          TEXT,
  created_at    INTEGER NOT NULL,
  UNIQUE (workspace_id, n)
);

CREATE INDEX idx_snapshots_workspace ON snapshots(workspace_id, n DESC);
CREATE INDEX idx_snapshots_user ON snapshots(user_id);
