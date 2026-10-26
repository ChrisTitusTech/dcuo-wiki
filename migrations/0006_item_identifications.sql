CREATE TABLE IF NOT EXISTS item_evidence (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  character_id TEXT NOT NULL,
  character_name TEXT NOT NULL,
  world_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  proposed_name TEXT NOT NULL,
  evidence TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  synced_at INTEGER NOT NULL,
  screenshot BLOB NOT NULL,
  screenshot_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','revoked')),
  created_at INTEGER NOT NULL,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at INTEGER,
  review_reason TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS item_evidence_pending ON item_evidence(user_id,item_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS item_evidence_queue ON item_evidence(status,created_at);
CREATE TABLE IF NOT EXISTS item_identifications (
  item_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  notes TEXT NOT NULL DEFAULT '',
  evidence_id TEXT NOT NULL UNIQUE REFERENCES item_evidence(id)
);

CREATE INDEX IF NOT EXISTS item_evidence_item ON item_evidence(item_id,status);

CREATE TABLE IF NOT EXISTS item_evidence_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_id TEXT NOT NULL REFERENCES item_evidence(id),
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK(decision IN ('approved','rejected','revoked')),
  reason TEXT NOT NULL,
  name TEXT,
  slug TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS item_review_history ON item_evidence_reviews(evidence_id,id);
