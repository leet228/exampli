// src/lib/cache.ts

type CacheEntry<T = any> = { v: T; e: number | null };

function safeLocalStorage(): Storage | null {
  try { return window?.localStorage ?? null; } catch { return null; }
}

export function cacheGet<T = any>(key: string): T | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(`exampli:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (parsed && (parsed.e === null || parsed.e > Date.now())) return parsed.v as T;
    // expired
    ls.removeItem(`exampli:${key}`);
    return null;
  } catch { return null; }
}

export function cacheSet<T = any>(key: string, value: T, ttlMs?: number): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    const entry: CacheEntry<T> = { v: value, e: typeof ttlMs === 'number' ? Date.now() + Math.max(0, ttlMs) : null };
    ls.setItem(`exampli:${key}`, JSON.stringify(entry));
  } catch {}
}

export function cacheRemove(key: string): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try { ls.removeItem(`exampli:${key}`); } catch {}
}

// Common cache keys
export const CACHE_KEYS = {
  user: 'user',
  userAvatarUrl: 'user_avatar_url',
  stats: 'stats',
  frosts: 'frosts',
  isPlus: 'plus_active',
  // AI: marker that free monthly token limit is reached (stores current YYYY-MM)
  aiFreeLimitMonth: 'ai_free_limit_month',
  lastStreakDay: 'last_streak_day',
  activeCourseCode: 'active_course_code',
  subjectsAll: 'subjects_all',
  userProfile: 'user_profile',
  friendsCount: 'friends_count',
  friendsList: 'friends_list',
  friendsPendingSent: 'friends_pending_sent',
  invitesIncomingCount: 'invites_incoming_count',
  invitesIncomingList: 'invites_incoming_list',
  // all streak days for current user (array of { day: 'YYYY-MM-DD', kind: 'active'|'freeze' })
  streakDaysAll: 'streak_days_all',
  lessonProgress: 'lesson_progress',
  subjectByCode: (code: string) => `subject_code:${code}`,
  lessonsByCode: (code: string) => `lessons_code:${code}`,
  // lessons cache keyed by topic (новый формат: уроки принадлежат теме)
  lessonsByTopic: (topicId: string | number) => `lessons_topic:${topicId}`,
  // topics cache per subject for offline usage
  topicsBySubject: (subjectId: string | number) => `topics_by_subject:${subjectId}`,
  // cached SVG data URL for topic icons by order_index (1..N)
  topicIconSvg: (orderIndex: number | string) => `topic_icon_svg:${orderIndex}`,
  // pre-uploaded public URLs for achievement PNGs
  achUrlStreak: 'ach_url_streak',
  achUrlPerfect: 'ach_url_perfect',
  achUrlDuel: 'ach_url_duel',
  // Daily quests (cache-first UI)
  dailyQuests: 'daily_quests_meta', // { day: 'YYYY-MM-DD', quests: Template[] }
  dailyQuestsProgress: 'daily_quests_progress', // Record<code, { progress, target, status, completed_at, claimed_at }>
  dailyQuestsTimeSeconds: 'daily_quests_time_seconds', // Record<code, number 0..59>
  // Invite/QR cache
  inviteUrl: 'invite_url',
  inviteQrSmall: 'invite_qr_small',
  inviteQrLarge: 'invite_qr_large',
};


