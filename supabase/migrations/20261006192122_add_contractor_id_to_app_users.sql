/*
# Добавление поля contractor_id в app_users

## Описание
Администратор может привязать зарегистрированного пользователя к конкретной
подрядной организации. При входе такой пользователь видит только данные своего подрядчика.

## Изменения

### Таблица app_users
- Добавлена колонка `contractor_id` (uuid, nullable) — ссылка на таблицу `contractors`.
  Если NULL — пользователь является администратором или сотрудником СМК без ограничений.
  Если задан — пользователь видит только данные своего подрядчика.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'contractor_id'
  ) THEN
    ALTER TABLE app_users ADD COLUMN contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL;
  END IF;
END $$;
