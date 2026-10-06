/*
# Система контроля доступа по номеру телефона

## Описание
Реализует двухэтапный доступ: пользователь подаёт заявку по номеру телефона,
администратор вручную генерирует пароль и одобряет доступ. Поддерживает
онлайн-статус, блокировку и журнал последнего входа.

## Новые таблицы

### access_requests (Заявки на доступ)
- id: uuid, первичный ключ
- phone: text, уникальный номер телефона заявителя
- status: text — 'pending' (ожидает) | 'approved' (одобрен) | 'rejected' (отклонён)
- created_at: дата подачи заявки

### app_users (Пользователи с доступом)
- id: uuid, первичный ключ
- phone: text, уникальный
- password_hash: text, простой открытый пароль (5 симв., хранится открыто для удобства передачи через WhatsApp)
- is_admin: boolean — признак администратора
- is_blocked: boolean — заблокирован ли
- is_online: boolean — онлайн-статус
- last_login_at: timestamptz — дата последнего входа
- created_at: дата создания

## Безопасность
- RLS включён на обеих таблицах
- Доступ на чтение/запись — anon + authenticated (приложение не использует Supabase Auth)
- Блокировка на уровне логики приложения

## Примечание
Пароль хранится в открытом виде намеренно — требование передачи через WhatsApp.
*/

CREATE TABLE IF NOT EXISTS access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_requests" ON access_requests;
CREATE POLICY "anon_select_requests" ON access_requests FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_requests" ON access_requests;
CREATE POLICY "anon_insert_requests" ON access_requests FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_requests" ON access_requests;
CREATE POLICY "anon_update_requests" ON access_requests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_requests" ON access_requests;
CREATE POLICY "anon_delete_requests" ON access_requests FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  password text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  is_blocked boolean NOT NULL DEFAULT false,
  is_online boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_users" ON app_users;
CREATE POLICY "anon_select_users" ON app_users FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_users" ON app_users;
CREATE POLICY "anon_insert_users" ON app_users FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_users" ON app_users;
CREATE POLICY "anon_update_users" ON app_users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_users" ON app_users;
CREATE POLICY "anon_delete_users" ON app_users FOR DELETE TO anon, authenticated USING (true);

-- Seed: first admin user (phone: +70000000000, password: admin)
INSERT INTO app_users (phone, password, is_admin)
VALUES ('+70000000000', 'admin', true)
ON CONFLICT (phone) DO NOTHING;
