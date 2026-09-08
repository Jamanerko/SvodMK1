-- Prevent duplicate material names (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS materials_name_lower_uniq ON materials (lower(name));
