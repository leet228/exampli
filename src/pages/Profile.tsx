import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { cacheGet, cacheSet, CACHE_KEYS } from '../lib/cache';

export default function Profile() {
  const [u, setU] = useState<any>(null);
  const [course, setCourse] = useState<string>('Курс');

  useEffect(() => {
    (async () => {
      const tg = (window as any)?.Telegram?.WebApp;
      const tu = tg?.initDataUnsafe?.user;
      if (!tu) return;
      // базовый user из БД
      const cachedU = cacheGet<any>(CACHE_KEYS.user);
      const { data: user } = cachedU ? { data: cachedU } : await supabase.from('users').select('*').eq('tg_id', String(tu.id)).single();
      setU({ ...user, tg_username: tu.username, photo_url: tu.photo_url, first_name: tu.first_name });
      cacheSet(CACHE_KEYS.user, user, 5 * 60_000);
      // текущий курс по users.added_course
      const addedId = (user as any)?.added_course as number | null | undefined;
      if (addedId) {
        const { data: s } = await supabase.from('subjects').select('title').eq('id', addedId).single();
        if (s?.title) setCourse(s.title as string);
      }
    })();
  }, []);

  const initials = (u?.first_name || 'U').slice(0,1).toUpperCase();

  return (
    <div className="flex flex-col items-center text-center gap-4">
      <div className="relative">
        {u?.photo_url ? (
          <img
            src={u.photo_url}
            alt=""
            className="w-28 h-28 rounded-full object-cover border border-white/10 shadow-soft"
          />
        ) : (
          <div className="w-28 h-28 rounded-full grid place-items-center text-3xl font-bold
                          bg-gradient-to-b from-sky-500 to-indigo-600 text-white shadow-soft">
            {initials}
          </div>
        )}
      </div>

      <div className="text-2xl font-semibold">
        {u?.first_name || u?.username || u?.tg_username || 'Гость'}
      </div>

      <div className="text-sm text-muted -mt-2">@{u?.tg_username || u?.username || 'anon'}</div>

      <div className="card w-full">
        <div className="text-sm text-muted mb-1">Текущий курс</div>
        <div className="font-semibold">{course}</div>
      </div>

      <div className="grid grid-cols-3 gap-3 w-full">
        <div className="card"><div className="text-sm text-muted">🔥 Стрик</div><div className="text-xl font-bold">{u?.streak ?? 0}</div></div>
        <div className="card"><div className="text-sm text-muted">⚡ Энергия</div><div className="text-xl font-bold">{(u?.hearts ?? 5)*5}</div></div>
        <div className="card"><div className="text-sm text-muted">⭐ XP</div><div className="text-xl font-bold">{u?.xp ?? 0}</div></div>
      </div>
    </div>
  );
}