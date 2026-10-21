CREATE TABLE article_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  part TEXT NOT NULL,
  base_hash TEXT NOT NULL,
  parent_revision INTEGER NOT NULL,
  content TEXT NOT NULL,
  previous_content TEXT NOT NULL,
  reason TEXT NOT NULL,
  sources TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  character_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(slug, part, base_hash, parent_revision)
);
CREATE INDEX article_revision_lookup ON article_revisions(slug, part, base_hash, id DESC);
