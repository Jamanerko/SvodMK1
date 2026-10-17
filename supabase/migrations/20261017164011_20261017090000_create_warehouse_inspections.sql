/*
# Add warehouse material inspection workflow

1. New Tables
- `warehouse_inspections` — inspection transfer records with the transfer date, destination organization, lifecycle status, and notes.
- `warehouse_inspection_items` — materials included in each transfer, including quantity sent for inspection, quantity inspected, and quantity rejected as defective.

2. Data Rules
- Inspection quantities cannot be negative.
- Inspected quantity cannot exceed the quantity transferred.
- Defective quantity cannot exceed the quantity inspected.
- Items reference the existing material catalog and are deleted with their inspection record.

3. Security
- Row level security is enabled on both tables.
- This is a shared single-project warehouse application, so anon and authenticated users receive separate CRUD policies for both tables.

4. Important Notes
- An inspection with status `in_review` temporarily reserves its transferred quantity and keeps it unavailable for contractor issuance.
- A `completed` inspection returns the non-defective quantity to stock; defective quantity remains unavailable.
- A `cancelled` inspection does not affect available stock.
*/

CREATE TABLE IF NOT EXISTS warehouse_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_date date NOT NULL DEFAULT CURRENT_DATE,
  destination text NOT NULL,
  status text NOT NULL DEFAULT 'in_review' CHECK (status IN ('in_review', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouse_inspection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES warehouse_inspections(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  transferred_quantity numeric(14,2) NOT NULL CHECK (transferred_quantity > 0),
  inspected_quantity numeric(14,2) NOT NULL DEFAULT 0 CHECK (inspected_quantity >= 0),
  defective_quantity numeric(14,2) NOT NULL DEFAULT 0 CHECK (defective_quantity >= 0),
  created_at timestamptz DEFAULT now(),
  UNIQUE (inspection_id, material_id),
  CHECK (inspected_quantity <= transferred_quantity),
  CHECK (defective_quantity <= inspected_quantity)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_inspections_date ON warehouse_inspections(inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_inspections_status ON warehouse_inspections(status);
CREATE INDEX IF NOT EXISTS idx_warehouse_inspection_items_inspection ON warehouse_inspection_items(inspection_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_inspection_items_material ON warehouse_inspection_items(material_id);

ALTER TABLE warehouse_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_inspection_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_warehouse_inspections" ON warehouse_inspections;
CREATE POLICY "anon_select_warehouse_inspections" ON warehouse_inspections FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_warehouse_inspections" ON warehouse_inspections;
CREATE POLICY "anon_insert_warehouse_inspections" ON warehouse_inspections FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_warehouse_inspections" ON warehouse_inspections;
CREATE POLICY "anon_update_warehouse_inspections" ON warehouse_inspections FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_warehouse_inspections" ON warehouse_inspections;
CREATE POLICY "anon_delete_warehouse_inspections" ON warehouse_inspections FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_warehouse_inspection_items" ON warehouse_inspection_items;
CREATE POLICY "anon_select_warehouse_inspection_items" ON warehouse_inspection_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_warehouse_inspection_items" ON warehouse_inspection_items;
CREATE POLICY "anon_insert_warehouse_inspection_items" ON warehouse_inspection_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_warehouse_inspection_items" ON warehouse_inspection_items;
CREATE POLICY "anon_update_warehouse_inspection_items" ON warehouse_inspection_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_warehouse_inspection_items" ON warehouse_inspection_items;
CREATE POLICY "anon_delete_warehouse_inspection_items" ON warehouse_inspection_items FOR DELETE TO anon, authenticated USING (true);