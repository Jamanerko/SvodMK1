/*
# Update purchase request types and add partial receipt tracking
1. Drop old constraint, update data, add new constraint (rk/rf)
2. New table: warehouse_issue_receipts for partial contractor receipt
*/

-- Step 1: Drop old constraint
ALTER TABLE purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_request_type_check;

-- Step 2: Update existing data
UPDATE purchase_requests SET request_type = 'rk' WHERE request_type = 'internal';
UPDATE purchase_requests SET request_type = 'rf' WHERE request_type = 'external';

-- Step 3: Add new constraint
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_request_type_check
  CHECK (request_type IN ('rk', 'rf'));

-- Step 4: Create warehouse_issue_receipts table
CREATE TABLE IF NOT EXISTS warehouse_issue_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_issue_id uuid NOT NULL REFERENCES warehouse_issues(id) ON DELETE CASCADE,
  warehouse_issue_item_id uuid NOT NULL REFERENCES warehouse_issue_items(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  ordered_quantity numeric(14,2) NOT NULL,
  received_quantity numeric(14,2) NOT NULL DEFAULT 0,
  reason text,
  received_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wir_issue ON warehouse_issue_receipts(warehouse_issue_id);
CREATE INDEX IF NOT EXISTS idx_wir_item ON warehouse_issue_receipts(warehouse_issue_item_id);

ALTER TABLE warehouse_issue_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_wir" ON warehouse_issue_receipts;
CREATE POLICY "anon_crud_wir" ON warehouse_issue_receipts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_wir" ON warehouse_issue_receipts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_wir" ON warehouse_issue_receipts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_wir" ON warehouse_issue_receipts FOR DELETE TO anon, authenticated USING (true);
