-- Drop the case-insensitive unique index on name - materials with same name but different articles are valid
DROP INDEX IF EXISTS materials_name_lower_uniq;

-- Create a unique index on (lower(name), lower(article)) instead - same name+article = duplicate
CREATE UNIQUE INDEX IF NOT EXISTS materials_name_article_uniq ON materials (lower(name), COALESCE(lower(article), ''));
