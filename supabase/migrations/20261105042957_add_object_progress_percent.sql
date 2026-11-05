/*
# Object readiness progress (0-100%)

1. What changes
- Every object and sub-object gets a readiness percentage that the team can update.

2. Modified table: objects
- New column `progress_percent` (integer, 0 to 100, default 0).
- Constraint keeps the value inside the 0-100 range.

3. Important notes
- Existing rows start at 0% and nothing else changes.
- The objects table already has its grants and policies, so no access is added or loosened.
*/

ALTER TABLE objects ADD COLUMN IF NOT EXISTS progress_percent integer NOT NULL DEFAULT 0;

ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_progress_percent_range;
ALTER TABLE objects
  ADD CONSTRAINT objects_progress_percent_range
  CHECK (progress_percent BETWEEN 0 AND 100);
