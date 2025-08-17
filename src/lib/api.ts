// src/lib/api.ts
const base = 'https://api.kursik.online';

function tgId(): string | null {
  try { return String((window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id || '') || null; }
  catch { return null; }
}

export type Subject = { id:number; code:string; title:string; level:string };

export async function apiSubjects(): Promise<Subject[]> {
  const r = await fetch(`${base}/subjects`);
  return r.json();
}

export async function apiUser() {
  const id = tgId(); if (!id) return null;
  const r = await fetch(`${base}/users/by-tg?tg_id=${encodeURIComponent(id)}`);
  return r.json();
}

export async function apiUserSubjects(): Promise<Subject[]> {
  const id = tgId(); if (!id) return [];
  const r = await fetch(`${base}/user-subjects?tg_id=${encodeURIComponent(id)}`);
  return r.json();
}

export async function apiAddUserSubjectByCode(code: string) {
  const id = tgId(); if (!id) return { error: 'tg_id missing' };
  const r = await fetch(`${base}/user-subjects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tg_id: id, code })
  });
  return r.json();
}

export async function apiLessonsBySubjectCode(code: string) {
  const r = await fetch(`${base}/lessons?code=${encodeURIComponent(code)}`);
  return r.json() as Promise<{ subject:{id:number; title:string}, lessons:{id:number; title:string}[] }>;
}
