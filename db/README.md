# Миграции БД (Supabase / Postgres)

В каталоге `db/migrations` лежат прикладные SQL:
- `001_indexes.sql` — индексы для горячих запросов
- `002_rpc_boot1.sql` — агрегирующая функция `rpc_boot1(p_user_id uuid, p_active_code text)`
- `003_rpc_boot2.sql` — агрегирующая функция `rpc_boot2(p_user_id uuid, p_active_id uuid)`

## Как применить (любой удобный способ)

1) Через Supabase SQL Editor
- Откройте ваш проект → SQL → вставьте содержимое файлов по порядку и выполните.

2) Через psql
- Подключитесь к базе (`psql "postgres://USER:PASSWORD@HOST:PORT/dbname"`) и выполните файлы по порядку:
```sql
\i db/migrations/001_indexes.sql
\i db/migrations/002_rpc_boot1.sql
\i db/migrations/003_rpc_boot2.sql
```

3) Через Supabase CLI (если настроен)
- Перенесите SQL в каталог `supabase/migrations` (или подключите наш `db/migrations`) и выполните `supabase db push`.

## Дополнительно
- Индексы безопасны к повторному запуску (`IF NOT EXISTS`).
- Функции созданы `security definer` и выданы `GRANT EXECUTE` ролям `anon, authenticated, service_role`.
- Перед введением уникального ключа на `users(tg_id)` убедитесь в отсутствии дубликатов.

## Очереди и нотификации
- Для массовых уведомлений используется Upstash QStash. Необходимые переменные окружения:
  - `QSTASH_TOKEN` (обязательно)
  - `QSTASH_URL` (опционально, если нужен кастомный endpoint)
  - `TELEGRAM_BOT_TOKEN` (отправка сообщений)
  - Для Redis (кэш/дедупликация энергии): `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Крон `/api/cron_notify` теперь ставит задачи чанками в `/api/notify_batch`.


