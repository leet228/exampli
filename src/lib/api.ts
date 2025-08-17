// src/lib/api.ts

// Можно переопределить домен через .env:
// NEXT_PUBLIC_API_BASE=https://api.kursik.online
const API_BASE = import.meta.env.VITE_API_BASE || 'https://api.kursik.online';

const url = (path: string) => `${API_BASE}${path}`;

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url(path), init);
  if (!res.ok) {
    let extra = '';
    try { extra = await res.text(); } catch {}
    throw new Error(`API ${path} -> ${res.status} ${res.statusText} ${extra}`);
  }
  return res.json() as Promise<T>;
}

// --- Telegram helpers ---
function tg() {
  const w: any = typeof window !== 'undefined' ? window : {};
  return w?.Telegram?.WebApp?.initDataUnsafe?.user || null;
}
function tgId(): string | null {
  const id = tg()?.id;
  return id ? String(id) : null;
}

// --- Types ---
export type Course = { id: number; code: string; title: string; level: string };

export type User = {
  id: number;
  tg_id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  xp: number;
  streak: number;
  energy: number; // 0..25
  added_courses_id: number[] | null;
  current_course_id: number | null;
  current_topic_id: number | null;
  current_subtopic_id?: number | null;
};

export type Topic = { id: number; topic: string };
export type Subtopic = { id: number; subtopic: string };

// --- API wrappers ---
export async function apiHealth() {
  return fetchJSON<{ ok: boolean; db?: boolean; error?: string }>('/health');
}

export async function apiUser(): Promise<User | null> {
  const id = tgId();
  if (!id) return null;
  return fetchJSON<User | null>(`/users/by-tg?tg_id=${encodeURIComponent(id)}`);
}

export async function apiSyncTg() {
  const u = tg();
  if (!u) return null;
  return fetchJSON<User>('/users/sync-tg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tg_id: String(u.id),
      username: u.username || null,
      first_name: u.first_name || null,
      last_name: u.last_name || null,
      avatar_url: u.photo_url || null,
    }),
  });
}

export async function apiCourses(): Promise<Course[]> {
  return fetchJSON<Course[]>('/courses');
}

export async function apiUserCourses(): Promise<Course[]> {
  const id = tgId();
  if (!id) return [];
  return fetchJSON<Course[]>(
    `/users/courses?tg_id=${encodeURIComponent(id)}`
  );
}

export async function apiAddCourseToUser(arg: { course_id?: number; code?: string }) {
  const id = tgId();
  if (!id) return { error: 'tg_id missing' };
  return fetchJSON<{ ok?: true; user?: any; error?: string }>(
    '/users/add-course',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tg_id: id, ...arg }),
    }
  );
}

export async function apiSetCurrentCourse(course_id: number) {
  const id = tgId();
  if (!id) return null;
  return fetchJSON('/users/current', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tg_id: id, current_course_id: course_id }),
  });
}

export async function apiSetCurrentSelection(args: {
  course_id?: number;
  topic_id?: number;
  subtopic_id?: number;
}) {
  const uid = tgId();
  if (!uid) return null;

  const body: any = { tg_id: String(uid) };
  if (args.course_id != null) body.current_course_id = args.course_id;
  if (args.topic_id != null) body.current_topic_id = args.topic_id;
  if (args.subtopic_id != null) body.current_subtopic_id = args.subtopic_id;

  return fetchJSON('/users/current', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function apiLessonsByCourse(course_id: number) {
  return fetchJSON<{ id: number; lesson: string }[]>(
    `/lessons?course_id=${course_id}`
  );
}

export async function apiTopics(course_id: number) {
  return fetchJSON<Topic[]>(`/topics?course_id=${course_id}`);
}

export async function apiSubtopics(course_id: number, topic_id: number) {
  return fetchJSON<Subtopic[]>(
    `/subtopics?course_id=${course_id}&topic_id=${topic_id}`
  );
}

export async function apiLeaderboard(limit = 50) {
  return fetchJSON<
    { id: number; tg_id: string; username: string | null; first_name: string | null; xp: number | null; streak: number | null }[]
  >(`/users/leaderboard?limit=${limit}`);
}
