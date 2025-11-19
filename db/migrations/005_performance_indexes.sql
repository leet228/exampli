-- Performance indexes for scaling to 100K+ users
-- These indexes will significantly speed up common queries

-- ================================================
-- USERS TABLE
-- ================================================

-- Index for fast user lookup by Telegram ID (most common query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_tg_id 
ON users(tg_id);

-- Index for user lookup with added_course filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_added_course 
ON users(added_course) 
WHERE added_course IS NOT NULL;

-- Index for active users (energy > 0)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active_energy 
ON users(energy) 
WHERE energy > 0;

-- ================================================
-- FRIEND_LINKS TABLE
-- ================================================

-- Composite index for friend queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_friend_links_status_users 
ON friend_links(status, a_id, b_id);

-- Index for accepted friends (most common filter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_friend_links_accepted 
ON friend_links(a_id, b_id) 
WHERE status = 'accepted';

-- Index for pending invitations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_friend_links_pending_requester 
ON friend_links(requester_id, status) 
WHERE status = 'pending';

-- ================================================
-- TASKS TABLE
-- ================================================

-- Composite index for lesson tasks ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_lesson_order 
ON tasks(lesson_id, order_index, id);

-- Partial index for tasks with options (choice/multiple_choice)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_with_options 
ON tasks(lesson_id) 
WHERE options IS NOT NULL;

-- ================================================
-- LESSONS TABLE
-- ================================================

-- Composite index for topic lessons ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lessons_topic_order 
ON lessons(topic_id, order_index, id);

-- ================================================
-- TOPICS TABLE
-- ================================================

-- Composite index for subject topics ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_topics_subject_order 
ON topics(subject_id, order_index, id);

-- ================================================
-- STREAK_DAYS TABLE
-- ================================================

-- Composite index for user streak queries (DESC for recent days)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_streak_days_user_day 
ON streak_days(user_id, day DESC);

-- Partial index for active streak days only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_streak_days_active 
ON streak_days(user_id, day DESC) 
WHERE kind = 'active';

-- Index for freeze days
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_streak_days_freeze 
ON streak_days(user_id, day DESC) 
WHERE kind = 'freeze';

-- ================================================
-- SUBJECTS TABLE
-- ================================================

-- Index for subject code lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subjects_code 
ON subjects(code);

-- Index for subject level filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subjects_level 
ON subjects(level);

-- ================================================
-- USER_PROFILE TABLE
-- ================================================

-- Index for phone number lookup (onboarding)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_profile_phone 
ON user_profile(phone_number) 
WHERE phone_number IS NOT NULL;

-- Index for username lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_profile_username 
ON user_profile(username) 
WHERE username IS NOT NULL;

-- ================================================
-- ANALYTICS & MONITORING
-- ================================================

-- Analyze tables to update statistics for query planner
ANALYZE users;
ANALYZE friend_links;
ANALYZE tasks;
ANALYZE lessons;
ANALYZE topics;
ANALYZE streak_days;
ANALYZE subjects;
ANALYZE user_profile;

-- ================================================
-- COMMENTS FOR MAINTENANCE
-- ================================================
COMMENT ON INDEX idx_users_tg_id IS 'Fast user lookup by Telegram ID - used in boot1/boot2';
COMMENT ON INDEX idx_friend_links_status_users IS 'Composite index for friend status queries';
COMMENT ON INDEX idx_tasks_lesson_order IS 'Tasks ordering for lesson runner';
COMMENT ON INDEX idx_streak_days_user_day IS 'User streak history with DESC ordering';

