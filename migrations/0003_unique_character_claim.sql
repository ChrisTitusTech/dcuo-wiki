-- Fail safely if duplicate claims exist; resolve them before applying this migration.
-- Census character IDs identify the character independently of name casing or renames.
CREATE UNIQUE INDEX profiles_character_claim ON profiles(character_id);
