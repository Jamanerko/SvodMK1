/*
# Construction Project Management Schema

## Purpose
System for managing a railway construction project: tracking materials across
stations (станции), crossovers (разъезды), and stretches (перегоны), with
warehouse inventory, purchase requests, contractor issuance, and project
correction history.

## New Tables

1. **objects** — Construction locations: stations, crossovers, stretches
   - type: 'station' | 'crossover' | 'stretch'
   - Stretches link two objects (from_object_id → to_object_id)
   - sequence_order defines the linear order along the route

2. **material_categories** — Grouping for materials (e.g. cables, fasteners)

3. **materials** — Catalog of ~300 materials with article code and unit

4. **requirements** — Planned material quantity per object (from project spec)
   - Unique per (material_id, object_id)
   - This is the CURRENT planned quantity after all corrections

5. **requirement_corrections** — Full audit trail of every change to requirements
   - old_quantity, new_quantity, reason, changed_by, changed_at
   - Allows tracing why a number changed and when

6. **contractors** — Construction companies doing installation work

7. **contractor_objects** — Which contractors work on which objects

8. **warehouse_receipts** — Material arriving at the warehouse (г.Каражал)
   - quantity, receipt_date, supplier, document_url (АПП link), notes

9. **purchase_requests** — Procurement requests (internal 1С or external)
   - request_type: 'internal' | 'external'
   - status: 'draft' | 'submitted' | 'accepted' | 'in_transit' | 'delivered' | 'cancelled'
   - request_date, expected_delivery_date, actual_delivery_date

10. **purchase_request_items** — Breakdown of a purchase request by object
    - Explains WHY a quantity is ordered (which objects need it)

11. **warehouse_issues** — Material issuance to contractors (header)
    - contractor_id, issue_date, status: 'planned' | 'confirmed'
    - Contractor can plan a pickup then confirm it

12. **warehouse_issue_items** — Items within an issuance (material × object × quantity)

## Security
- Single-tenant app (no auth). All tables use TO anon, authenticated with USING (true).
- Data is intentionally shared — the operator manages everything, contractors self-serve via dropdown.

## Notes
- Deficit calculation: required (sum of requirements) - ordered (sum of purchase requests) = deficit.
  Negative deficit → red, need to order more.
- Warehouse on-hand: received (sum of warehouse_receipts) - issued (sum of warehouse_issue_items).
*/

-- =========================================================
-- 1. OBJECTS (станции, разъезды, перегоны)
-- =========================================================
CREATE TABLE IF NOT EXISTS objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('station', 'crossover', 'stretch')),
  name text NOT NULL,
  code text,
  sequence_order integer NOT NULL DEFAULT 0,
  from_object_id uuid REFERENCES objects(id) ON DELETE SET NULL,
  to_object_id uuid REFERENCES objects(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_objects_type ON objects(type);
CREATE INDEX IF NOT EXISTS idx_objects_sequence ON objects(sequence_order);

ALTER TABLE objects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_objects" ON objects;
CREATE POLICY "anon_crud_objects" ON objects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_objects" ON objects FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_objects" ON objects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_objects" ON objects FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- 2. MATERIAL CATEGORIES
-- =========================================================
CREATE TABLE IF NOT EXISTS material_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE material_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_material_categories" ON material_categories;
CREATE POLICY "anon_crud_material_categories" ON material_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_material_categories" ON material_categories FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_material_categories" ON material_categories FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_material_categories" ON material_categories FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- 3. MATERIALS
-- =========================================================
CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  article text,
  unit text NOT NULL DEFAULT 'шт',
  category_id uuid REFERENCES material_categories(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category_id);
CREATE INDEX IF NOT EXISTS idx_materials_article ON materials(article);
CREATE INDEX IF NOT EXISTS idx_materials_name ON materials(name);

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_materials" ON materials;
CREATE POLICY "anon_crud_materials" ON materials FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_materials" ON materials FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_materials" ON materials FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_materials" ON materials FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- 4. REQUIREMENTS (потребность: материал × объект = кол-во)
-- =========================================================
CREATE TABLE IF NOT EXISTS requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  quantity numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (material_id, object_id)
);

CREATE INDEX IF NOT EXISTS idx_requirements_material ON requirements(material_id);
CREATE INDEX IF NOT EXISTS idx_requirements_object ON requirements(object_id);

ALTER TABLE requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_requirements" ON requirements;
CREATE POLICY "anon_crud_requirements" ON requirements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_requirements" ON requirements FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_requirements" ON requirements FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_requirements" ON requirements FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- 5. REQUIREMENT CORRECTIONS (история корректировок)
-- =========================================================
CREATE TABLE IF NOT EXISTS requirement_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id uuid NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  old_quantity numeric(14,2) NOT NULL,
  new_quantity numeric(14,2) NOT NULL,
  reason text,
  changed_by text NOT NULL DEFAULT 'operator',
  changed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_corrections_requirement ON requirement_corrections(requirement_id);
CREATE INDEX IF NOT EXISTS idx_corrections_material ON requirement_corrections(material_id);
CREATE INDEX IF NOT EXISTS idx_corrections_changed_at ON requirement_corrections(changed_at DESC);

ALTER TABLE requirement_corrections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_corrections" ON requirement_corrections;
CREATE POLICY "anon_crud_corrections" ON requirement_corrections FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_corrections" ON requirement_corrections FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_corrections" ON requirement_corrections FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_corrections" ON requirement_corrections FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- 6. CONTRACTORS (подрядчики)
-- =========================================================
CREATE TABLE IF NOT EXISTS contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_contractors" ON contractors;
CREATE POLICY "anon_crud_contractors" ON contractors FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_contractors" ON contractors FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_contractors" ON contractors FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_contractors" ON contractors FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- 7. CONTRACTOR OBJECTS (на каких объектах работает подрядчик)
-- =========================================================
CREATE TABLE IF NOT EXISTS contractor_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  UNIQUE (contractor_id, object_id)
);

CREATE INDEX IF NOT EXISTS idx_contractor_objects_contractor ON contractor_objects(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_objects_object ON contractor_objects(object_id);

ALTER TABLE contractor_objects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_contractor_objects" ON contractor_objects;
CREATE POLICY "anon_crud_contractor_objects" ON contractor_objects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_contractor_objects" ON contractor_objects FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_contractor_objects" ON contractor_objects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_contractor_objects" ON contractor_objects FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- 8. WAREHOUSE RECEIPTS (приход на склад)
-- =========================================================
CREATE TABLE IF NOT EXISTS warehouse_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity numeric(14,2) NOT NULL,
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier text,
  document_url text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipts_material ON warehouse_receipts(material_id);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON warehouse_receipts(receipt_date DESC);

ALTER TABLE warehouse_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_receipts" ON warehouse_receipts;
CREATE POLICY "anon_crud_receipts" ON warehouse_receipts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_receipts" ON warehouse_receipts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_receipts" ON warehouse_receipts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_receipts" ON warehouse_receipts FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- 9. PURCHASE REQUESTS (заявки на закуп)
-- =========================================================
CREATE TABLE IF NOT EXISTS purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  total_quantity numeric(14,2) NOT NULL,
  request_type text NOT NULL DEFAULT 'internal' CHECK (request_type IN ('internal', 'external')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'accepted', 'in_transit', 'delivered', 'cancelled')),
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date date,
  actual_delivery_date date,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_material ON purchase_requests(material_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_type ON purchase_requests(request_type);

ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_purchase_requests" ON purchase_requests;
CREATE POLICY "anon_crud_purchase_requests" ON purchase_requests FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_purchase_requests" ON purchase_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_purchase_requests" ON purchase_requests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_purchase_requests" ON purchase_requests FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- 10. PURCHASE REQUEST ITEMS (разбивка заявки по объектам)
-- =========================================================
CREATE TABLE IF NOT EXISTS purchase_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id uuid NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  quantity numeric(14,2) NOT NULL,
  UNIQUE (purchase_request_id, object_id)
);

CREATE INDEX IF NOT EXISTS idx_pri_request ON purchase_request_items(purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_pri_object ON purchase_request_items(object_id);

ALTER TABLE purchase_request_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_pri" ON purchase_request_items;
CREATE POLICY "anon_crud_pri" ON purchase_request_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_pri" ON purchase_request_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_pri" ON purchase_request_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_pri" ON purchase_request_items FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- 11. WAREHOUSE ISSUES (выдача подрядчикам — заголовок)
-- =========================================================
CREATE TABLE IF NOT EXISTS warehouse_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'confirmed', 'cancelled')),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issues_contractor ON warehouse_issues(contractor_id);
CREATE INDEX IF NOT EXISTS idx_issues_date ON warehouse_issues(issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_issues_status ON warehouse_issues(status);

ALTER TABLE warehouse_issues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_issues" ON warehouse_issues;
CREATE POLICY "anon_crud_issues" ON warehouse_issues FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_issues" ON warehouse_issues FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_issues" ON warehouse_issues FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_issues" ON warehouse_issues FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- 12. WAREHOUSE ISSUE ITEMS (позиции выдачи: материал × объект × кол-во)
-- =========================================================
CREATE TABLE IF NOT EXISTS warehouse_issue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_issue_id uuid NOT NULL REFERENCES warehouse_issues(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  quantity numeric(14,2) NOT NULL,
  UNIQUE (warehouse_issue_id, material_id, object_id)
);

CREATE INDEX IF NOT EXISTS idx_wii_issue ON warehouse_issue_items(warehouse_issue_id);
CREATE INDEX IF NOT EXISTS idx_wii_material ON warehouse_issue_items(material_id);
CREATE INDEX IF NOT EXISTS idx_wii_object ON warehouse_issue_items(object_id);

ALTER TABLE warehouse_issue_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_wii" ON warehouse_issue_items;
CREATE POLICY "anon_crud_wii" ON warehouse_issue_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_wii" ON warehouse_issue_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_wii" ON warehouse_issue_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_wii" ON warehouse_issue_items FOR DELETE TO anon, authenticated USING (true);

-- =========================================================
-- SEED: Initial objects (the route described by user)
-- =========================================================
INSERT INTO objects (type, name, code, sequence_order) VALUES
  ('station',  'Ст. Кызылжар',     'СТ-КЖ',  1),
  ('stretch',  'Перегон Кызылжар — Рзд 1', 'П-КЖ-1', 2),
  ('crossover','Разъезд 1',        'РЗД-1',  3),
  ('stretch',  'Перегон Рзд 1 — Рзд 2',     'П-1-2',  4),
  ('crossover','Разъезд 2',        'РЗД-2',  5),
  ('stretch',  'Перегон Рзд 2 — Рзд 3',     'П-2-3',  6),
  ('crossover','Разъезд 3',        'РЗД-3',  7),
  ('stretch',  'Перегон Рзд 3 — Рзд 4',     'П-3-4',  8),
  ('crossover','Разъезд 4',        'РЗД-4',  9),
  ('stretch',  'Перегон Рзд 4 — Рзд 5',     'П-4-5',  10),
  ('crossover','Разъезд 5',        'РЗД-5',  11),
  ('stretch',  'Перегон Рзд 5 — Ст. Каражал-2', 'П-5-КЖ2', 12),
  ('station',  'Ст. Каражал-2',    'СТ-КЖ2', 13),
  ('stretch',  'Перегон Каражал-2 — Рзд 6',  'П-КЖ2-6', 14),
  ('crossover','Разъезд 6',        'РЗД-6',  15),
  ('stretch',  'Перегон Рзд 6 — Рзд 7',     'П-6-7',  16),
  ('crossover','Разъезд 7',        'РЗД-7',  17)
ON CONFLICT DO NOTHING;

-- Link stretches to their endpoints
UPDATE objects SET from_object_id = (SELECT id FROM objects WHERE code = 'СТ-КЖ'),  to_object_id = (SELECT id FROM objects WHERE code = 'РЗД-1')  WHERE code = 'П-КЖ-1';
UPDATE objects SET from_object_id = (SELECT id FROM objects WHERE code = 'РЗД-1'), to_object_id = (SELECT id FROM objects WHERE code = 'РЗД-2')  WHERE code = 'П-1-2';
UPDATE objects SET from_object_id = (SELECT id FROM objects WHERE code = 'РЗД-2'), to_object_id = (SELECT id FROM objects WHERE code = 'РЗД-3')  WHERE code = 'П-2-3';
UPDATE objects SET from_object_id = (SELECT id FROM objects WHERE code = 'РЗД-3'), to_object_id = (SELECT id FROM objects WHERE code = 'РЗД-4')  WHERE code = 'П-3-4';
UPDATE objects SET from_object_id = (SELECT id FROM objects WHERE code = 'РЗД-4'), to_object_id = (SELECT id FROM objects WHERE code = 'РЗД-5')  WHERE code = 'П-4-5';
UPDATE objects SET from_object_id = (SELECT id FROM objects WHERE code = 'РЗД-5'), to_object_id = (SELECT id FROM objects WHERE code = 'СТ-КЖ2') WHERE code = 'П-5-КЖ2';
UPDATE objects SET from_object_id = (SELECT id FROM objects WHERE code = 'СТ-КЖ2'), to_object_id = (SELECT id FROM objects WHERE code = 'РЗД-6')  WHERE code = 'П-КЖ2-6';
UPDATE objects SET from_object_id = (SELECT id FROM objects WHERE code = 'РЗД-6'), to_object_id = (SELECT id FROM objects WHERE code = 'РЗД-7')  WHERE code = 'П-6-7';

-- Seed: warehouse location label (stored as a setting-like singleton in contractors for now)
-- Actually we'll hardcode the warehouse name in the app: "г. Каражал"
