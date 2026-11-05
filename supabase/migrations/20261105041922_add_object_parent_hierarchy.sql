/*
# Object hierarchy: sub-objects linked to a parent object

1. What changes
- Objects can now be "sub-objects" that belong to a main object (station, crossover or stretch).
- New sub-object types: МАПС (maps), МС (ms), КТСМ (ktsm), Переезд (crossing), Прочее (other).

2. Modified table: objects
- New column `parent_id` (uuid, nullable): references objects(id) of the owning main object.
- Main objects (station, crossover, stretch) must have no parent.
- Sub-objects must have a parent.
- The type list is widened to include the new sub-object types.

3. Important notes
- Deleting a parent is blocked while it still has sub-objects (ON DELETE RESTRICT), so nothing is removed by accident.
- An index on parent_id keeps child lookups fast.
- No existing rows change: all current objects are main objects and keep parent_id = NULL.
- Security: the objects table already has its grants and policies; nothing is added or loosened here.
*/

ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_type_check;

ALTER TABLE objects
  ADD CONSTRAINT objects_type_check
  CHECK (type IN ('station', 'crossover', 'stretch', 'maps', 'ms', 'ktsm', 'crossing', 'other'));

ALTER TABLE objects ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES objects(id) ON DELETE RESTRICT;

ALTER TABLE objects DROP CONSTRAINT IF EXISTS objects_parent_matches_type;
ALTER TABLE objects
  ADD CONSTRAINT objects_parent_matches_type
  CHECK (
    (type IN ('station', 'crossover', 'stretch') AND parent_id IS NULL)
    OR (type IN ('maps', 'ms', 'ktsm', 'crossing', 'other') AND parent_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS objects_parent_id_idx ON objects (parent_id);
