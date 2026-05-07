-- Migration 0001: users + sessions
-- Created for email-OTP account creation. See project-docs/auth/design.md.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  email_lower   TEXT NOT NULL,
  handle        TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  verified_at   INTEGER
);

CREATE UNIQUE INDEX idx_users_email_lower ON users(email_lower);
CREATE UNIQUE INDEX idx_users_handle ON users(handle);

CREATE TABLE sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
