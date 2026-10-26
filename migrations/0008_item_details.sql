-- Item definition details are global; equipped/scaled stats do not belong here.
CREATE TABLE item_details (
  item_id TEXT PRIMARY KEY,
  details_json TEXT NOT NULL CHECK (json_valid(details_json)),
  evidence_id TEXT NOT NULL REFERENCES item_evidence(id),
  captured_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Per-character values stay bound to their exact equipped slot and item ID.
CREATE TABLE equipment_item_details (
  character_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  item_id TEXT NOT NULL,
  details_json TEXT NOT NULL CHECK (json_valid(details_json)),
  evidence_id TEXT NOT NULL REFERENCES item_evidence(id),
  captured_at INTEGER NOT NULL,
  PRIMARY KEY(character_id,world_id,slot)
);
-- Revoked evidence cannot continue publishing definitions or equipped values.
CREATE TRIGGER revoke_companion_item_details
AFTER UPDATE OF status ON item_evidence
WHEN OLD.status='approved' AND NEW.status<>'approved'
BEGIN
  DELETE FROM item_details WHERE evidence_id=NEW.id;
  DELETE FROM equipment_item_details WHERE evidence_id=NEW.id;
END;
