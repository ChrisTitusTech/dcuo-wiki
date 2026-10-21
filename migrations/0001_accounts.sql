CREATE TABLE users (
  id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE oauth_states (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, page_title TEXT NOT NULL DEFAULT '');
CREATE INDEX oauth_expiry ON oauth_states(expires_at);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX session_expiry ON sessions(expires_at);
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  character_name TEXT NOT NULL,
  world_id TEXT NOT NULL,
  census_json TEXT NOT NULL,
  matched_at INTEGER NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  screenshot BLOB,
  screenshot_type TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE contributions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  character_id TEXT NOT NULL,
  character_name TEXT NOT NULL,
  page_slug TEXT NOT NULL,
  suggestion TEXT NOT NULL,
  sources TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','rejected')),
  created_at INTEGER NOT NULL,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at INTEGER
);
CREATE INDEX contribution_queue ON contributions(status, created_at);
CREATE INDEX contribution_user ON contributions(user_id, created_at);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX rate_expiry ON rate_limits(expires_at);
