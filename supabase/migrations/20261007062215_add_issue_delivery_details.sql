/*
# Дополнительные сведения о выдаче со склада

1. Изменения таблицы `warehouse_issues`
- `additional_objects` — текстовое описание других объектов, если выдача предназначена не только для объектов из таблицы.
- `issue_comment` — дополнительные комментарии к выдаче.
- `received_by` — ФИО или имя ответственного, который принял выдачу.

2. Совместимость
- Все новые поля допускают пустое значение, поэтому существующие выдачи сохраняются без изменений.

3. Безопасность
- Права доступа не изменяются: таблица продолжает использовать существующие политики общего рабочего пространства.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'warehouse_issues' AND column_name = 'additional_objects'
  ) THEN
    ALTER TABLE warehouse_issues ADD COLUMN additional_objects text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'warehouse_issues' AND column_name = 'issue_comment'
  ) THEN
    ALTER TABLE warehouse_issues ADD COLUMN issue_comment text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'warehouse_issues' AND column_name = 'received_by'
  ) THEN
    ALTER TABLE warehouse_issues ADD COLUMN received_by text;
  END IF;
END $$;