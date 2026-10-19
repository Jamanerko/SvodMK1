ALTER TABLE warehouse_receipts ADD COLUMN IF NOT EXISTS drum_number text;
ALTER TABLE warehouse_issue_items ADD COLUMN IF NOT EXISTS drum_number text;
