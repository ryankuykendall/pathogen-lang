-- Migration 0002: workspace moderation
--
-- Adds the deny-list flag on users and the append-only publication-state
-- history table. The state table is the source of truth for workspace
-- visibility on /explore and /featured; the most recent row per
-- workspace_id determines the effective state. See project plan in
-- .claude/plans/we-have-had-explore-robust-summit.md.
--
-- No is_admin column — admin identity is gated by the ADMIN_EMAILS env
-- var, so admin elevation never traverses mutable storage.

ALTER TABLE users ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN flag_notes TEXT;

CREATE TABLE workspace_publication_states (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id            TEXT NOT NULL,
  state                   TEXT NOT NULL
                          CHECK (state IN ('unpublished','pending','approved','rejected','flagged')),
  transitioned_at         INTEGER NOT NULL,
  transitioned_by_user_id TEXT NOT NULL,
  code_hash               TEXT,
  internal_notes          TEXT
);

CREATE INDEX idx_pub_states_workspace_latest
  ON workspace_publication_states(workspace_id, transitioned_at DESC);

CREATE INDEX idx_pub_states_user_flag
  ON workspace_publication_states(transitioned_by_user_id);
