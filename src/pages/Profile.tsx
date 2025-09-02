import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import FriendsPanel from '../components/panels/FriendsPanel';
import { cacheGet, cacheSet, CACHE_KEYS } from '../lib/cache';

export default function Profile() {
  const [u, setU] = useState<any>(null);
  const [course, setCourse] = useState<string>('Курс');
  const [courseCode, setCourseCode] = useState<string | null>(null);
  const [bg, setBg] = useState<string>('#3280c2');
  const [baseBg, setBaseBg] = useState<string>('#3280c2');
  const [bgIcon, setBgIcon] = useState<string>('bg_icon_cat');
  const [tempBgIcon, setTempBgIcon] = useState<string>('bg_icon_cat');
  const [iconsOpen, setIconsOpen] = useState<boolean>(false);
  const iconsCloud = useMemo(() => {
    // Симметричная раскладка 18 иконок: ряды 2,3,2,4,2,3,2
    // Центральный ряд (4) имеет «дырку» по центру, чтобы не наезжать на аватар
    // Сжимание по вертикали: ряды ближе друг к другу (малый шаг по Y)
    const rows: { y: number; xs: number[] }[] = [
      { y: 30, xs: [28, 72] },            // 2
      { y: 38, xs: [18, 50, 82] },        // 3
      { y: 46, xs: [28, 72] },            // 2
      { y: 58, xs: [10, 30, 70, 90] },    // 4 — по уровню центра аватарки, дальше от неё по X
      { y: 70, xs: [28, 72] },            // 2
      { y: 78, xs: [18, 50, 82] },        // 3
      { y: 86, xs: [28, 72] },            // 2
    ];
    const items: { x: number; y: number; s: number; r: number; o: number }[] = [];
    rows.forEach((row) => {
      row.xs.forEach((x) => {
        items.push({ x, y: row.y, s: 1, r: 0, o: 0.28 });
      });
    });
    return items;
  }, []);
  const [phone, setPhone] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState<boolean>(false);
  const colors = ['#3280c2', '#3a9c21', '#c37024', '#b94c45', '#8957ca', '#36a4b1', '#b64b83', '#788897'];
  const gradientPairs: Array<[string, string]> = [
    ['#73d5ee','#508dcc'],
    ['#a6cf59','#3c9656'],
    ['#e7a93c','#cf7344'],
    ['#f8906b','#ca555e'],
    ['#e57bdf','#9662ce'],
    ['#77ddc5','#3a97c0'],
    ['#f08d90','#c44f83'],
    ['#acb6c2','#6b7783'],
  ];
  const [sel, setSel] = useState<string>('');
  const [friendsOpen, setFriendsOpen] = useState<boolean>(false);

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
      // фото: надёжный фолбэк — пробуем несколько URL
      try {
        const uname = tu?.username as string | undefined;
        const direct = (tu?.photo_url as string | undefined) || '';
        const candidates = [
          direct,
          ...(uname ? [
            `https://t.me/i/userpic/320/${uname}.jpg`,
            `https://t.me/i/userpic/320/${uname}.png`,
            `https://t.me/i/userpic/160/${uname}.jpg`,
            `https://t.me/i/userpic/160/${uname}.png`,
          ] : []),
        ].filter(Boolean) as string[];

        const testNext = (i: number) => {
          if (i >= candidates.length) return;
          const url = candidates[i] + (i > 0 ? `?v=${Date.now()}` : '');
          const img = new Image();
          img.onload = () => { try { setPhotoUrl(url); } catch {} };
          img.onerror = () => testNext(i + 1);
          img.referrerPolicy = 'no-referrer';
          img.src = url;
        };
        testNext(0);
      } catch {}
      // профиль (фон/иконка/тел/username) из boot.userProfile
      try {
        const prof = (window as any)?.__exampliBoot?.userProfile || null;
        if (prof?.background_color) { setBg(String(prof.background_color)); setBaseBg(String(prof.background_color)); }
        if (prof?.background_icon) { setBgIcon(String(prof.background_icon)); setTempBgIcon(String(prof.background_icon)); }
        if (prof?.phone_number) setPhone(String(prof.phone_number));
        if (prof?.username) setUsername(String(prof.username));
      } catch {}
      setSel((window as any)?.__exampliBoot?.userProfile?.background_color || '#3280c2');
      cacheSet(CACHE_KEYS.user, user);
      // текущий курс по users.added_course — из boot.subjectsAll
      const addedId = (user as any)?.added_course as number | null | undefined;
      if (addedId) {
        try {
          const boot: any = (window as any)?.__exampliBoot || {};
          const listAll: any[] | undefined = boot?.subjectsAll;
          const listUser: any[] | undefined = boot?.subjects;
          let found = listAll?.find?.((s: any) => Number(s.id) === Number(addedId));
          if (!found && Array.isArray(listUser)) found = listUser.find?.((s: any) => Number(s.id) === Number(addedId));
          if (found?.title) setCourse(String(found.title));
          if (found?.code) setCourseCode(String(found.code));
          if (!found) {
            const codeLs = (() => { try { return localStorage.getItem('exampli:activeSubjectCode'); } catch { return null; } })();
            if (codeLs) setCourseCode(codeLs);
          }
        } catch {}
      }
    })();
  }, []);

  // тянем фон панели выше экрана при скролле: меняем body::before цвет
  useEffect(() => {
    try {
      document.body.classList.add('profile-overscroll');
      document.documentElement.style.setProperty('--profile-bg', bg);
      return () => {
        document.body.classList.remove('profile-overscroll');
        document.documentElement.style.removeProperty('--profile-bg');
      };
    } catch { return; }
  }, [bg]);

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
          {/* декоративный слой: много маленьких иконок, разбросанные по полю с сильным затуханием к краям */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              maskImage: 'radial-gradient(75% 70% at 50% 48%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.75) 45%, rgba(0,0,0,0.35) 62%, rgba(0,0,0,0.0) 82%)',
              WebkitMaskImage: 'radial-gradient(75% 70% at 50% 48%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.75) 45%, rgba(0,0,0,0.35) 62%, rgba(0,0,0,0.0) 82%)'
            }}
          >
            {iconsCloud.map((it, i) => (
              <img
                key={i}
                src={`/profile_icons/${tempBgIcon}.svg`}
                alt=""
                style={{
                  position: 'absolute',
                  left: `${it.x}%`,
                  top: `${it.y}%`,
                  width: `${24 * it.s}px`,
                  height: `${24 * it.s}px`,
                  opacity: it.o,
                  transform: `translate(-50%, -50%) rotate(${it.r}deg)`,
                  filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))'
                }}
              />
            ))}
          </div>
          <div className="absolute inset-0" style={{ pointerEvents: 'none' }} />
          {/* Кнопка Изменить в правом верхнем углу (скрыта в режиме редактирования) */}
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="absolute right-4 top-36 px-2 py-1 rounded-full text-[12px] font-semibold text-white/95"
              style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.18)', zIndex: 2, pointerEvents: 'auto' }}
            >
              Изменить
            </button>
          )}

          <div className="relative h-full flex flex-col items-center justify-end pb-2">
            {/* Аватарка + локальное свечение строго по кругу аватарки */}
            <div className="relative mb-3">
              {/* свечение: круг больше аватарки, мягкая прозрачность */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  width: 300,
                  height: 300,
                  borderRadius: '50%',
                  background: 'radial-gradient(closest-side, rgba(255,255,255,0.32), rgba(255,255,255,0) 80%)',
                  zIndex: 0,
                }}
              />
              <div className="relative z-[1] w-28 h-28 rounded-full overflow-hidden bg-black/20 border border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.25)]">
                {photoUrl || u?.photo_url ? (
                  <img src={(photoUrl || u?.photo_url) as string} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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

      {/* Карточки/метрики ниже хиро */}
      {!editing ? (
        <>
          {/* Верхняя строка: слева курс, справа друзья (без рамок/карт) */}
          <div className="w-full max-w-xl px-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="px-0 py-1 flex flex-col items-center justify-center text-center justify-self-start">
                {courseCode ? (
                  <img src={`/subjects/${courseCode}.svg`} alt="Курс" className="w-16 h-16 object-contain" />
                ) : (
                  <div className="w-16 h-16 grid place-items-center text-2xl">🧩</div>
                )}
                <div className="text-sm text-muted" style={{ marginTop: -12 }}>Курс</div>
              </div>
              <div className="px-0 py-1 flex justify-center justify-self-end">
                <button
                  type="button"
                  onClick={() => { setFriendsOpen(true); }}
                  className="ml-auto flex flex-col items-center justify-center active:opacity-80"
                  style={{ cursor: 'pointer' }}
                >
                  <div className="text-2xl font-extrabold tabular-nums leading-tight">0</div>
                  <div className="text-sm text-muted leading-tight mt-1">друзья</div>
                </button>
              </div>
            </div>
          </div>

          {/* Кнопка «Добавить друзей» */}
          <div className="w-full max-w-xl px-3">
            <button type="button" className="w-full rounded-3xl px-4 py-4 bg-white/5 border border-white/10 flex items-center justify-center gap-2 font-semibold">
              <span className="text-lg">👤＋</span>
              <span>Добавить друзей</span>
            </button>
          </div>

          {/* Обзор */}
          <div className="w-full max-w-xl px-3 mt-3">
            <div className="text-xs tracking-wide uppercase text-muted mb-2">Обзор</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="px-1 py-1 flex items-center gap-3">
                <img src="/stickers/fire.svg" alt="Стрик" className="w-12 h-12" />
                <div className="text-2xl font-extrabold tabular-nums">{u?.streak ?? 0}</div>
                <div className="text-base">{(u?.streak ?? 0) === 1 ? 'день' : 'дней'}</div>
              </div>
              <div className="px-1 py-1 flex items-center gap-3 justify-end">
                <img src="/stickers/coin_cat.svg" alt="coins" className="w-10 h-10" />
                <div className="text-2xl font-extrabold tabular-nums">{u?.coins ?? 0}</div>
                <div className="text-base">coin</div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Палитра цветов + градиенты в одной панели */}
          <div className="w-full max-w-xl px-3">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3 overflow-hidden">
              {/* сплошные цвета */}
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
              {/* градиенты */}
              <div className="mt-2 grid grid-cols-8 gap-2 place-items-center">
                {gradientPairs.map(([top, bottom]) => {
                  const previewSplit = `linear-gradient(180deg, ${top} 0%, ${top} 50%, ${bottom} 50%, ${bottom} 100%)`;
                  const valueGrad = `linear-gradient(135deg, ${top} 0%, ${bottom} 100%)`;
                  const active = sel === valueGrad;
                  return (
                    <motion.button
                      key={`${top}-${bottom}`}
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      onClick={() => { setSel(valueGrad); setBg(valueGrad); }}
                      className="relative"
                      style={{ width: 28, height: 28, borderRadius: 9999, background: previewSplit, border: active ? '2px solid rgba(255,255,255,0.95)' : '1px solid rgba(255,255,255,0.18)' }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Выбор иконок профиля */}
          <div className="w-full max-w-xl px-3">
            <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
              {/* кнопка-заголовок как в примере */}
              <button
                type="button"
                onClick={() => setIconsOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3"
                style={{ borderBottom: iconsOpen ? '1px solid rgba(255,255,255,0.10)' : '1px solid transparent' }}
              >
                <div className="text-left">
                  <div className="text-sm font-semibold">Иконки профиля</div>
                </div>
                <div className="flex items-center gap-2">
                  <img src={`/profile_icons/${tempBgIcon}.svg`} alt="" className="w-7 h-7 rounded-md" />
                  <span className="text-white/70">▾</span>
                </div>
              </button>

              {/* выпадающая панель с иконками */}
              {iconsOpen && (
                <div className="px-3 pb-3 pt-2 grid grid-cols-6 gap-2">
                  {['bg_icon_cat'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTempBgIcon(key)}
                      className={`rounded-xl border ${tempBgIcon===key? 'border-white/60 bg-white/10' : 'border-white/10 bg-white/5'}`}
                      style={{ padding: 8 }}
                    >
                      <img src={`/profile_icons/${key}.svg`} alt="" className="w-10 h-10" />
                    </button>
                  ))}
                </div>
              )}
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
                  if (!uid) throw new Error('No user id');
                  // сначала попробуем обновить, если профиль есть
                  let ok = false;
                  try {
                    const { data: upd, error: updErr } = await supabase
                      .from('user_profile')
                      .update({ background_color: sel, background_icon: tempBgIcon })
                      .eq('user_id', uid)
                      .select('user_id')
                      .single();
                    if (!updErr && upd) ok = true;
                  } catch {}
                  if (!ok) {
                    const { data: ins, error: insErr } = await supabase
                      .from('user_profile')
                      .insert({ user_id: uid, background_color: sel, background_icon: tempBgIcon })
                      .select('user_id')
                      .single();
                    if (insErr) throw insErr;
                  }
                  // обновим boot и кэш
                  try {
                    const boot: any = (window as any).__exampliBoot || {};
                    (boot.userProfile ||= {} as any).background_color = sel;
                    (boot.userProfile ||= {} as any).background_icon = tempBgIcon;
                    (window as any).__exampliBoot = boot;
                  } catch {}
                  try {
                    const prev = (cacheGet as any)(CACHE_KEYS.userProfile) || {};
                    cacheSet(CACHE_KEYS.userProfile, { ...prev, background_color: sel, background_icon: tempBgIcon });
                  } catch {}
                  setBg(sel);
                  setBgIcon(tempBgIcon);
                } catch (e) { try { console.warn('save color failed', e); } catch {} }
                setEditing(false);
              }}
            >
              Сохранить
            </button>
            {/* Телеграм BackButton — отмена изменений */}
            <CancelOnTelegramBack onCancel={() => { setBg(baseBg); setSel(baseBg); setTempBgIcon(bgIcon); setEditing(false); }} active={editing} />
          </div>
        </>
      )}
      {/* Панель друзей как отдельный полноэкранный компонент */}
      <FriendsPanel open={friendsOpen} onClose={() => setFriendsOpen(false)} />
    </div>
  );
}

function CancelOnTelegramBack({ active, onCancel }: { active: boolean; onCancel: () => void }) {
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    if (!tg) return;
    if (!active) { try { tg.BackButton?.hide?.(); } catch {} return; }
    try {
      tg.BackButton?.show?.();
      const handler = () => { onCancel(); };
      tg.onEvent?.('backButtonClicked', handler);
      return () => { try { tg.offEvent?.('backButtonClicked', handler); tg.BackButton?.hide?.(); } catch {} };
    } catch { return; }
  }, [active, onCancel]);
  return null;
}