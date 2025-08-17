// src/pages/Profile.tsx
import { useEffect, useState } from 'react';
import { apiUser, apiUserCourses, type Course } from '../lib/api';

const ACTIVE_ID_KEY = 'exampli:activeCourseId';

type UIUser = {
  id?: number;
  xp?: number;
  streak?: number;
  energy?: number; // 0..25
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  tg_username?: string | null;
  photo_url?: string | null;
};

export default function Profile() {
  const [u, setU] = useState<UIUser | null>(null);
  const [course, setCourse] = useState<string>('Курс');

  // загрузка профиля и курса
  useEffect(() => {
    (async () => {
      // Телега
      const tg = (window as any)?.Telegram?.WebApp;
      const tu = tg?.initDataUnsafe?.user;
      // Бэкенд
      const srv = await apiUser();

      // собрать объект для UI
      setU({
        id: srv?.id,
        xp: srv?.xp ?? 0,
        streak: srv?.streak ?? 0,
        energy: typeof srv?.energy === 'number' ? srv!.energy : 25,
        username: srv?.username ?? null,
        first_name: srv?.first_name ?? null,
        last_name: srv?.last_name ?? null,
        avatar_url: srv?.avatar_url ?? null,
        tg_username: tu?.username ?? null,
        photo_url: tu?.photo_url ?? null,
      });

      // определить активный курс: LS -> users.current_course_id -> первый из списка
      let activeId: number | null = null;
      try {
        const v = localStorage.getItem(ACTIVE_ID_KEY);
        if (v) activeId = Number(v);
      } catch {}

      if (!activeId && srv?.current_course_id) activeId = srv.current_course_id;

      const list: Course[] = await apiUserCourses();
      if (list.length) {
        const found = (activeId && list.find((c) => c.id === activeId)) || list[0];
        setCourse(found.title);
      } else {
        setCourse('Курс');
      }
    })();

    // обновлять название курса по событию из других мест
    const onCourseChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ title?: string }>;
      if (e.detail?.title) setCourse(e.detail.title);
    };
    window.addEventListener('exampli:courseChanged', onCourseChanged as EventListener);
    return () => window.removeEventListener('exampli:courseChanged', onCourseChanged as EventListener);
  }, []);

  const initials = (() => {
    const name =
      (u?.first_name || '') ||
      (u?.username || '') ||
      (u?.tg_username || '') ||
      'U';
    return name.slice(0, 1).toUpperCase();
  })();

  const energy = typeof u?.energy === 'number' ? u!.energy : 25;

  return (
    <div className="flex flex-col items-center text-center gap-4">
      <div className="relative">
        {u?.photo_url || u?.avatar_url ? (
          <img
            src={(u.photo_url as string) || (u.avatar_url as string)}
            alt=""
            className="w-28 h-28 rounded-full object-cover border border-white/10 shadow-soft"
          />
        ) : (
          <div
            className="w-28 h-28 rounded-full grid place-items-center text-3xl font-bold
                       bg-gradient-to-b from-sky-500 to-indigo-600 text-white shadow-soft"
          >
            {initials}
          </div>
        )}
      </div>

      <div className="text-2xl font-semibold">
        {u?.first_name || u?.username || u?.tg_username || 'Гость'}
      </div>

      <div className="text-sm text-muted -mt-2">
        @{u?.tg_username || u?.username || 'anon'}
      </div>

      <div className="card w-full">
        <div className="text-sm text-muted mb-1">Текущий курс</div>
        <div className="font-semibold">{course}</div>
      </div>

      <div className="grid grid-cols-3 gap-3 w-full">
        <div className="card">
          <div className="text-sm text-muted">🔥 Стрик</div>
          <div className="text-xl font-bold">{u?.streak ?? 0}</div>
        </div>
        <div className="card">
          <div className="text-sm text-muted">⚡ Энергия</div>
          <div className="text-xl font-bold">{energy}</div>
        </div>
        <div className="card">
          <div className="text-sm text-muted">⭐ XP</div>
          <div className="text-xl font-bold">{u?.xp ?? 0}</div>
        </div>
      </div>
    </div>
  );
}
