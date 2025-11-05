-- Индексы для ускорения горячих путей чтения/записи
-- Запускать в Supabase (SQL Editor) или через supabase CLI

-- users
CREATE INDEX IF NOT EXISTS users_tg_id_idx ON public.users (tg_id);
CREATE INDEX IF NOT EXISTS users_last_active_at_idx ON public.users (last_active_at);
CREATE INDEX IF NOT EXISTS users_plus_until_idx ON public.users (plus_until);
CREATE INDEX IF NOT EXISTS users_ai_plus_until_idx ON public.users (ai_plus_until);
CREATE INDEX IF NOT EXISTS users_added_course_idx ON public.users (added_course);
CREATE INDEX IF NOT EXISTS users_current_topic_idx ON public.users (current_topic);

-- user_profile
CREATE UNIQUE INDEX IF NOT EXISTS user_profile_user_id_key ON public.user_profile (user_id);

-- chosen_courses
CREATE INDEX IF NOT EXISTS chosen_courses_user_id_idx ON public.chosen_courses (user_id);

-- subjects / topics / lessons
CREATE UNIQUE INDEX IF NOT EXISTS subjects_code_key ON public.subjects (code);
CREATE INDEX IF NOT EXISTS topics_subject_order_idx ON public.topics (subject_id, order_index);
CREATE INDEX IF NOT EXISTS lessons_topic_order_idx ON public.lessons (topic_id, order_index);

-- friend_links
-- Частичные индексы под кейсы status = 'accepted'
CREATE INDEX IF NOT EXISTS friend_links_accepted_a_idx ON public.friend_links (a_id) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS friend_links_accepted_b_idx ON public.friend_links (b_id) WHERE status = 'accepted';
-- Для pending инвайтов (часто b_id = текущий пользователь)
CREATE INDEX IF NOT EXISTS friend_links_pending_b_idx ON public.friend_links (b_id) WHERE status = 'pending';

-- streak_days
CREATE INDEX IF NOT EXISTS streak_days_user_day_idx ON public.streak_days (user_id, day);

-- app_presence
CREATE INDEX IF NOT EXISTS app_presence_expires_at_idx ON public.app_presence (expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS app_presence_user_id_key ON public.app_presence (user_id);

-- ai_usage (используется upsert on conflict (user_id, month))
CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_user_month_key ON public.ai_usage (user_id, month);

-- phone_verifications / daily quests
CREATE INDEX IF NOT EXISTS phone_verifications_phone_idx ON public.phone_verifications (phone_e164);
CREATE INDEX IF NOT EXISTS user_daily_quest_progress_user_day_idx ON public.user_daily_quest_progress (user_id, day);
CREATE INDEX IF NOT EXISTS daily_quests_day_day_idx ON public.daily_quests_day (day);

-- Примечание: уникальность users(tg_id) зависит от данных. Если нужны уникальные tg_id,
-- предварительно устраните дубликаты и замените индекс на UNIQUE.


