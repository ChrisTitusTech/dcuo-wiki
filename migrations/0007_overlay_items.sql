CREATE TABLE overlay_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  character_id TEXT NOT NULL,
  character_name TEXT NOT NULL,
  world_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
ALTER TABLE item_evidence ADD COLUMN source TEXT NOT NULL DEFAULT 'screenshot';
ALTER TABLE item_evidence ADD COLUMN capture_json TEXT;
CREATE TRIGGER overlay_profile_changed
AFTER UPDATE OF character_id,character_name,world_id ON profiles
WHEN OLD.character_id<>NEW.character_id OR OLD.character_name<>NEW.character_name OR OLD.world_id<>NEW.world_id
BEGIN
  DELETE FROM overlay_tokens WHERE user_id=NEW.user_id;
END;
CREATE TRIGGER overlay_profile_deleted AFTER DELETE ON profiles
BEGIN
  DELETE FROM overlay_tokens WHERE user_id=OLD.user_id;
END;
