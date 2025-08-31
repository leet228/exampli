import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { cacheGet, cacheSet, CACHE_KEYS } from '../lib/cache';

export default function Profile() {
  const [u, setU] = useState<any>(null);
  const [course, setCourse] = useState<string>('Курс');
  const [bg, setBg] = useState<string>('#3280c2');
  const [phone, setPhone] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [editing, setEditing] = useState<boolean>(false);
  const colors = ['#3280c2', '#3a9c21', '#c37024', '#b94c45', '#8957ca', '#36a4b1', '#b64b83', '#788897'];
  const [sel, setSel] = useState<string>('');

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
      setSel((window as any)?.__exampliBoot?.userProfile?.background_color || '#3280c2');
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
          // ещё выше к самому верху
          marginTop: 'calc(-1 * (var(--hud-top) + var(--hud-h) + 64px))',
        }}
      >
        <div
          className="relative w-full"
          style={{
            // ещё выше панель и ниже контент → добавим высоту
            height: 340,
            // фон — чистый цвет из профиля, без общего свечения
            background: bg,
          }}
        >
          <div className="absolute inset-0" style={{ pointerEvents: 'none' }} />
          {/* Кнопка Изменить в правом верхнем углу */}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="absolute right-4 top-36 px-2 py-1 rounded-full text-[12px] font-semibold text-white/95"
            style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.18)', zIndex: 2, pointerEvents: 'auto' }}
          >
            Изменить
          </button>

          <div className="relative h-full flex flex-col items-center justify-end pb-2">
            {/* Аватарка + локальное свечение строго по кругу аватарки */}
            <div className="relative mb-3">
              {/* свечение: круг больше аватарки, мягкая прозрачность */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  width: 220,
                  height: 220,
                  borderRadius: '50%',
                  background: 'radial-gradient(closest-side, rgba(255,255,255,0.22), rgba(255,255,255,0) 72%)',
                  zIndex: 0,
                }}
              />
              <div className="relative z-[1] w-28 h-28 rounded-full overflow-hidden bg-black/20 border border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.25)]">
                {u?.photo_url ? (
                  <img src={u.photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-3xl font-bold text-white/90">
                    {initials}
                  </div>
                )}
              </div>
            </div>

            {/* Имя — ближе к строке контактов */}
            <div className="text-3xl font-extrabold tracking-wide text-white/95">
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
      {!editing ? (
        <>
          <div className="grid grid-cols-3 gap-3 w-full max-w-xl px-1">
            <div className="card"><div className="text-sm text-muted">🔥 Стрик</div><div className="text-xl font-bold">{u?.streak ?? 0}</div></div>
            <div className="card"><div className="text-sm text-muted">⚡ Энергия</div><div className="text-xl font-bold">{u?.energy ?? 25}</div></div>
            <div className="card"><div className="text-sm text-muted">💰 Коины</div><div className="text-xl font-bold">{u?.coins ?? 0}</div></div>
          </div>

          <div className="card w-full max-w-xl">
            <div className="text-sm text-muted mb-1">Текущий курс</div>
            <div className="font-semibold">{course}</div>
          </div>
        </>
      ) : (
        <>
          {/* Палитра цветов */}
          <div className="w-full max-w-xl px-3">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3 overflow-hidden">
              <div className="grid grid-cols-8 gap-2 place-items-center">
                {colors.map((c) => (
                  <motion.button
                    key={c}
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => { setSel(c); setBg(c); }}
                    className="relative"
                    style={{ width: 28, height: 28, borderRadius: 9999, background: c, border: '1px solid rgba(255,255,255,0.18)' }}
                  >
                    {sel === c && (
                      <span className="absolute inset-[-4px] rounded-full border-2" style={{ borderColor: 'rgba(255,255,255,0.95)' }} />
                    )}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          {/* Сохранить */}
          <div className="w-full max-w-xl px-3">
            <button
              type="button"
              className="btn w-full mt-4"
              onClick={async () => {
                try {
                  const uid = (u as any)?.id || (window as any)?.__exampliBoot?.user?.id;
                  if (uid) {
                    const { error } = await supabase
                      .from('user_profile')
                      .upsert({ user_id: uid, background_color: sel }, { onConflict: 'user_id' });
                    if (error) throw error;
                    // обновим boot-кэш и локальный стейт
                    try {
                      const boot: any = (window as any).__exampliBoot || {};
                      (boot.userProfile ||= {} as any).background_color = sel;
                      (window as any).__exampliBoot = boot;
                    } catch {}
                    setBg(sel);
                  }
                } catch (e) { try { console.warn('save color failed', e); } catch {} }
                setEditing(false);
              }}
            >
              Сохранить
            </button>
          </div>
        </>
      )}
    </div>
  );
}