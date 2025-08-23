import { cacheSet, CACHE_KEYS } from './cache';

export type ActiveCourse = { code: string; title: string } | null;

const KEY_CODE = 'exampli:activeSubjectCode';
const KEY_TITLE = 'exampli:activeSubjectTitle';

let current: ActiveCourse = null;
const subs = new Set<(c: ActiveCourse) => void>();

function safeSetItem(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}
function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function preloadIcon(code: string) {
  try { const img = new Image(); img.src = `/subjects/${code}.svg`; } catch {}
}

export function getActiveCourse(): ActiveCourse {
  if (current) return current;
  // try restore from storage
  const code = safeGetItem(KEY_CODE);
  const title = safeGetItem(KEY_TITLE);
  if (code) {
    current = { code, title: title || '' };
    return current;
  }
  return null;
}

export function subscribeActiveCourse(fn: (c: ActiveCourse) => void): () => void {
  subs.add(fn);
  // immediate sync
  try { fn(getActiveCourse()); } catch {}
  return () => { subs.delete(fn); };
}

export function setActiveCourse(next: { code: string; title?: string }) {
  const code = String(next.code);
  const title = (next.title ?? current?.title ?? '') as string;
  current = { code, title };

  // persist snapshot
  safeSetItem(KEY_CODE, code);
  safeSetItem(KEY_TITLE, title);
  cacheSet(CACHE_KEYS.activeCourseCode, code, 10 * 60_000);

  // warm icon
  preloadIcon(code);

  // broadcast to listeners
  subs.forEach((fn) => { try { fn(current); } catch {} });

  // keep backwards-compat events for existing code paths
  try {
    window.dispatchEvent(new CustomEvent('exampli:courseChanged', { detail: { title, code } } as any));
  } catch {}
}

export function initActiveCourseFromBootIfEmpty() {
  if (getActiveCourse()) return;
  try {
    const boot = (window as any).__exampliBoot as any | undefined;
    const subj = boot?.subjects?.[0];
    if (subj?.code) {
      setActiveCourse({ code: subj.code, title: subj.title });
    }
  } catch {}
}


