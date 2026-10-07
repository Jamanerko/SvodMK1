/*
# Таблица выдач на другие участки (свободная форма)

Новая таблица `other_site_issues` хранит свободные выдачи материалов на участки,
которые не входят в основной справочник объектов.

1. Новые таблицы
- `other_site_issues` — заголовок выдачи: дата, участок (текст), кто принял (текст), примечание.
- `other_site_issue_items` — позиции: материал (можно выбрать из справочника или написать текстом),
  количество.

2. Безопасность
- RLS включён, политики для anon + authenticated (общее рабочее пространство без авторизации).
*/

CREATE TABLE IF NOT EXISTS other_site_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  site_name text NOT NULL,
  received_by text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osi_date ON other_site_issues(issue_date DESC);

ALTER TABLE other_site_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_sel_osi" ON other_site_issues;
CREATE POLICY "anon_sel_osi" ON other_site_issues FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_ins_osi" ON other_site_issues;
CREATE POLICY "anon_ins_osi" ON other_site_issues FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_upd_osi" ON other_site_issues;
CREATE POLICY "anon_upd_osi" ON other_site_issues FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_del_osi" ON other_site_issues;
CREATE POLICY "anon_del_osi" ON other_site_issues FOR DELETE TO anon, authenticated USING (true);


CREATE TABLE IF NOT EXISTS other_site_issue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  other_site_issue_id uuid NOT NULL REFERENCES other_site_issues(id) ON DELETE CASCADE,
  material_id uuid REFERENCES materials(id) ON DELETE SET NULL,
  material_name text NOT NULL,
  quantity numeric(14,2) NOT NULL,
  unit text
);

CREATE INDEX IF NOT EXISTS idx_osii_issue ON other_site_issue_items(other_site_issue_id);

ALTER TABLE other_site_issue_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_sel_osii" ON other_site_issue_items;
CREATE POLICY "anon_sel_osii" ON other_site_issue_items FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_ins_osii" ON other_site_issue_items;
CREATE POLICY "anon_ins_osii" ON other_site_issue_items FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_upd_osii" ON other_site_issue_items;
CREATE POLICY "anon_upd_osii" ON other_site_issue_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_del_osii" ON other_site_issue_items;
CREATE POLICY "anon_del_osii" ON other_site_issue_items FOR DELETE TO anon, authenticated USING (true);