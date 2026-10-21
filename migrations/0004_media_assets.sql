-- Image bytes live in R2; this catalog preserves source provenance.
CREATE TABLE IF NOT EXISTS media_assets (
  source_page TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  object_key TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS media_assets_sha256 ON media_assets(sha256);
