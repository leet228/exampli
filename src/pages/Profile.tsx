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
      {/* Хиро-блок: на всю ширину экрана, без скруглений, фон = background_color + мягкое свечение от аватарки */}
      <div
        className="relative"
        style={{
          width: '100vw',
          marginLeft: 'calc(50% - 50vw)',
          marginRight: 'calc(50% - 50vw)',
          // поднимаем панель к самому верху экрана, перекрывая внутренние отступы контейнера
          marginTop: 'calc(-1 * (var(--hud-top) + var(--hud-h) + 12px))',
        }}
      >
        <div
          className="relative w-full"
          style={{
            // высота панели как во втором скрине
            height: 260,
            // мягкое свечение вокруг предполагаемого центра аватарки + основной цвет фона из БД
            background: `radial-gradient(160px circle at 50% 120px, rgba(255,255,255,0.22), rgba(255,255,255,0) 65%), ${bg}`,
          }}
        >
          <div className="absolute inset-0" />

          <div className="relative h-full flex flex-col items-center justify-start pt-8">
            {/* Аватарка без внешних колец, лёгкая рамка */}
            <div className="w-28 h-28 rounded-full overflow-hidden bg-black/20 border border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.25)]">
              {u?.photo_url ? (
                <img src={u.photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full grid place-items-center text-3xl font-bold text-white/90">
                  {initials}
                </div>
              )}
            </div>

            {/* Имя — ближе к строке контактов */}
            <div className="mt-3 text-3xl font-extrabold tracking-wide text-white/95">
              {u?.first_name || u?.username || u?.tg_username || 'Гость'}
            </div>

            {/* Телефон • @username в одной строке, сразу под именем */}
            <div className="mt-1 text-lg text-white/85 flex items-center gap-2">
              {maskedPhone && <span>{maskedPhone}</span>}
              {maskedPhone && atUsername && <span className="opacity-70">•</span>}
              {atUsername && <span>{atUsername}</span>}
            </div>
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