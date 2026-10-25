-- Public Census equipment only. Key by character and world, never Discord identity.
CREATE TABLE IF NOT EXISTS equipment_snapshots (
  character_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  items_json TEXT,
  synced_at INTEGER,
  attempted_at INTEGER NOT NULL DEFAULT 0,
  next_refresh_at INTEGER NOT NULL DEFAULT 0,
  refresh_token TEXT,
  refresh_until INTEGER NOT NULL DEFAULT 0,
  last_error INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(character_id, world_id)
);
