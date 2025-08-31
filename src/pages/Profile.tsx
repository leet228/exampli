import { useEffect, useState } from 'react';
import { cacheGet, cacheSet, CACHE_KEYS } from '../lib/cache';

export default function Profile() {
  const [u, setU] = useState<any>(null);
  const [course, setCourse] = useState<string>('Курс');
  const [bg, setBg] = useState<string>('#3280c2');
  const [phone, setPhone] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const tg = (window as any)?.Telegram?.WebApp;
      const tu = tg?.initDataUnsafe?.user;
      if (!tu) return;
      // читаем только из кэша/boot, без обращения к БД
      let user: any | null = cacheGet<any>(CACHE_KEYS.user);
      if (!user || user.added_course == null) {
        const bootUser = (window as any)?.__exampliBoot?.user || null;
        user = bootUser || user;
        if (user) cacheSet(CACHE_KEYS.user, user);
      }
      setU({ ...user, tg_username: tu.username, photo_url: tu.photo_url, first_name: tu.first_name });
      // профиль (фон/иконка/тел/username) из boot.userProfile
      try {
        const prof = (window as any)?.__exampliBoot?.userProfile || null;
        if (prof?.background_color) setBg(String(prof.background_color));
        if (prof?.phone_number) setPhone(String(prof.phone_number));
        if (prof?.username) setUsername(String(prof.username));
      } catch {}
      cacheSet(CACHE_KEYS.user, user);
      // текущий курс по users.added_course — из boot.subjectsAll
      const addedId = (user as any)?.added_course as number | null | undefined;
      if (addedId) {
        try {
          const list = (window as any)?.__exampliBoot?.subjectsAll as any[] | undefined;
          const found = list?.find?.((s) => Number(s.id) === Number(addedId));
          if (found?.title) setCourse(String(found.title));
        } catch {}
      }
    })();
  }, []);

  const initials = (u?.first_name || 'U').slice(0,1).toUpperCase();
  const maskedPhone = phone ? phone : '';
  const atUsername = username ? `@${username}` : '';

  return (
    <div className="flex flex-col items-center text-center gap-5">
      {/* Хиро-блок с фоном и аватаром */}
      <div
        className="w-full max-w-xl rounded-3xl overflow-hidden"
        style={{ background: `radial-gradient(120px circle at 50% 30%, rgba(255,255,255,0.20), rgba(255,255,255,0) 60%), ${bg}` }}
      >
        <div className="px-5 pt-7 pb-6 flex flex-col items-center">
          <div className="w-28 h-28 rounded-full p-[6px]" style={{ background: 'rgba(255,255,255,0.28)' }}>
            <div className="w-full h-full rounded-full overflow-hidden bg-black/30 border border-white/20">
              {u?.photo_url ? (
                <img src={u.photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full grid place-items-center text-3xl font-bold text-white/90">
                  {initials}
                </div>
              )}
            </div>
          </div>

          {/* Имя крупно */}
          <div className="mt-4 text-4xl font-extrabold tracking-wide text-white/95">
            {u?.first_name || u?.username || u?.tg_username || 'Гость'}
          </div>

          {/* Телефон • @username в одной строке */}
          <div className="mt-2 text-lg text-white/80 flex items-center gap-2">
            {maskedPhone && <span>{maskedPhone}</span>}
            {maskedPhone && atUsername && <span className="opacity-70">•</span>}
            {atUsername && <span>{atUsername}</span>}
          </div>
        </div>
      </div>

      {/* Карточки показателей */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xl px-1">
        <div className="card"><div className="text-sm text-muted">🔥 Стрик</div><div className="text-xl font-bold">{u?.streak ?? 0}</div></div>
        <div className="card"><div className="text-sm text-muted">⚡ Энергия</div><div className="text-xl font-bold">{u?.energy ?? 25}</div></div>
        <div className="card"><div className="text-sm text-muted">💰 Коины</div><div className="text-xl font-bold">{u?.coins ?? 0}</div></div>
      </div>

      {/* Текущий курс */}
      <div className="card w-full max-w-xl">
        <div className="text-sm text-muted mb-1">Текущий курс</div>
        <div className="font-semibold">{course}</div>
      </div>
    </div>
  );
}