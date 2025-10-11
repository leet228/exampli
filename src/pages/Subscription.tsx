import { useEffect, useRef, useState } from 'react';
import { motion, useAnimation, useMotionValue } from 'framer-motion';
import { hapticSelect, hapticTiny } from '../lib/haptics';
import { cacheGet, cacheSet, CACHE_KEYS } from '../lib/cache';
import { supabase } from '../lib/supabase';

type Plan = { id: string; months: number; price: number; title: string };

export default function Subscription() {
  // Общие утилиты для кнопок с «нижней полоской»
  const accentColor = '#3c73ff';
  const shadowHeight = 6;
  // Для тестов: все цены показываем как 1 ⭐
  const toStars = (_rub: number): number => 1;
  // Цвет фона карточек монет (сама кнопка)
  const coinButtonColor = '#121923';
  const darken = (hex: string, amount = 18) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount / 100))));
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  };
  const plans: Plan[] = [
    { id: 'm1', months: 1,  price: 499,  title: 'КУРСИК' },
    { id: 'm6', months: 6,  price: 2699, title: 'КУРСИК' },
    { id: 'm12', months: 12, price: 4999, title: 'КУРСИК' },
  ];
  const gems = [
    { id: 'g1', icon: '/shop/chest.svg',  amount: 1200, rub: 499 },
    { id: 'g2', icon: '/shop/barrel.svg', amount: 3000, rub: 999 },
    { id: 'g3', icon: '/shop/cart.svg',   amount: 6500, rub: 1999 },
  ];
  const freezes = [
    { id: 's1', icon: '/shop/streak_1.svg', label: '1 день', coins: 425 },
    { id: 's2', icon: '/shop/streak_2.svg', label: '2 дня',  coins: 850 },
  ];

  const viewportRef = useRef<HTMLDivElement|null>(null);  // обёртка
  const trackDragRef = useRef<HTMLDivElement|null>(null); // сам трек (motion.div)
  const [vw, setVw] = useState(0);
  const [gap, setGap] = useState(0);     // 👈 gap в пикселях
  const [step, setStep] = useState(0);   // 👈 шаг = vw + gap
  const controls = useAnimation();                        // для анимации щелчка
  const x = useMotionValue(0);                            // текущий сдвиг трека (px)
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const setIdxSafe = (i:number) => { if (i!==idxRef.current){ idxRef.current=i; setIdx(i);} };
  const [isTouching, setIsTouching] = useState(false);

  // насколько левее центр (положительное число = левее)
  const ALIGN_SHIFT = 4;

  // измеряем ширину и ставим трек в позицию активного слайда
  useEffect(() => {
    const measure = () => {
      const vp = viewportRef.current;
      const track = trackDragRef.current;

      const w = vp?.clientWidth || 0;
      let g = 0;
      if (track) {
        const cs = getComputedStyle(track);
        g = parseFloat(cs.columnGap || cs.gap || '0') || 0;
      }

      setVw(w);
      setGap(g);
      setStep(w + g); // 👈 самый важный момент
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (viewportRef.current) ro.observe(viewportRef.current);
    if (trackDragRef.current) ro.observe(trackDragRef.current);
    return () => ro.disconnect();
  }, []);

  // Когда step посчитан — переставляем трек туда, где активный индекс
  useEffect(() => {
    if (step <= 0) return;
    const toX = -(idxRef.current * step) - ALIGN_SHIFT; // было + ALIGN_OFFSET
    controls.set({ x: toX });
    x.set(toX);
  }, [step]);

  const defaultCat = '/subs/sub_cat.svg';
  const ahuelCat   = '/subs/cat_ahuel.svg';
  const [catSrc, setCatSrc] = useState(defaultCat);

  // вычисляем ближайший индекс по текущему x
  const nearestByX = (curX: number) => {
    const s = step || 1;
    const raw = Math.round(Math.abs(curX + ALIGN_SHIFT) / s); // было (curX - ALIGN_OFFSET)
    return Math.max(0, Math.min(plans.length - 1, raw));
  };

  // Снап в пиксель на конкретный индекс
  const snapTo = async (target: number) => {
    const s = step || 1;
    const toX = -(target * s) - ALIGN_SHIFT; // было + ALIGN_OFFSET
    await controls.start({ x: toX, transition: { type: 'spring', stiffness: 420, damping: 38 } });
    x.set(toX);
    setIdxSafe(target);
    setCatSrc(defaultCat);
  };

  // По окончании жеста: ограничиваем до ±1 от старта и щёлкаем
  const onDragEnd = async (_: any, info: { offset: { x: number }, velocity: { x: number } }) => {
    const s = step || 1;
    const start = idxRef.current;
    const deltaSlides = info.offset.x / s;
    const swipeThreshold = 0.25;
    const velocityThreshold = 300;

    let target = start;
    if (deltaSlides >  swipeThreshold || info.velocity.x >  velocityThreshold) target = start - 1;
    if (deltaSlides < -swipeThreshold || info.velocity.x < -velocityThreshold) target = start + 1;

    target = Math.max(0, Math.min(plans.length - 1, target));
    await snapTo(target);
    setIsTouching(false);
  };

  // Пока тянем — показываем «анимированного» кота и не даём странице скроллиться по Y
  const onDragStart = () => {
    setIsTouching(true);
    setCatSrc(ahuelCat);
  };
  const onDrag = () => {
    const s = step || 1;
    const cur = x.get();
    const ideal = -(idxRef.current * s) - ALIGN_SHIFT; // было + ALIGN_OFFSET
    const exact = Math.abs(cur - ideal) <= 0.5;
    setCatSrc(exact ? defaultCat : ahuelCat);
  };


  const [highlight, setHighlight] = useState(false);
  const coinsRef = useRef<HTMLDivElement | null>(null);
  const [coins, setCoins] = useState<number>(0);
  const [sheetOpen, setSheetOpen] = useState<null | { days: 1 | 2; price: number; icon: string }>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isPlus, setIsPlus] = useState<boolean>(false);
  const [plusUntil, setPlusUntil] = useState<string | null>(null);
  // Автопродление отключено при оплате через Telegram Stars
  const [_autoRenew, _setAutoRenew] = useState<{ enabled: boolean; loading: boolean }>({ enabled: false, loading: false });



  // ловим сигнал для подсветки секции коинов
  useEffect(() => {
    // локальный счётчик монет для верхнего HUD страницы
    try {
      const cs = cacheGet<any>(CACHE_KEYS.stats);
      if (cs?.coins != null) setCoins(Number(cs.coins));
    } catch {}
    try {
      const boot = (window as any)?.__exampliBoot;
      const bc = boot?.stats?.coins;
      if (bc != null) setCoins(Number(bc));
    } catch {}
    const onStats = (evt: Event) => {
      const e = evt as CustomEvent<{ coins?: number }>;
      if (typeof e.detail?.coins === 'number') setCoins(e.detail.coins);
    };
    window.addEventListener('exampli:statsChanged', onStats as EventListener);
    return () => window.removeEventListener('exampli:statsChanged', onStats as EventListener);
  }, []);

  // Поймаем возврат c ?paid=1 или startapp=paid (из t.me/...) и покажем уведомление
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const paid = url.searchParams.get('paid');
      const tgStartApp = url.searchParams.get('tgWebAppStartParam') || url.searchParams.get('startapp');
      if (paid === '1') {
        url.searchParams.delete('paid');
        window.history.replaceState({}, '', url.toString());
        // Вибрация + всплывашка через кастомное событие (остальной UI может подписаться)
        try { hapticSelect(); } catch {}
        try {
          window.dispatchEvent(new CustomEvent('exampli:toast', { detail: { kind: 'success', text: 'Оплата прошла успешно' } } as any));
        } catch {}
      }
      if (tgStartApp === 'paid') {
        try { hapticSelect(); } catch {}
        try {
          window.dispatchEvent(new CustomEvent('exampli:toast', { detail: { kind: 'success', text: 'Оплата прошла успешно' } } as any));
        } catch {}
      }
    } catch {}
  }, []);

  // Признак активной подписки: читаем из кэша и обновляем по plus_until
  useEffect(() => {
    try { setIsPlus(Boolean(cacheGet<boolean>(CACHE_KEYS.isPlus))); } catch {}
    const onStatsPlus = (evt: Event) => {
      const e = evt as CustomEvent<{ plus_until?: string } & any>;
      const pu = e.detail?.plus_until;
      if (pu) {
        try {
          const active = new Date(pu).getTime() > Date.now();
          setIsPlus(active);
          cacheSet(CACHE_KEYS.isPlus, active);
        } catch {}
      }
    };
    window.addEventListener('exampli:statsChanged', onStatsPlus as EventListener);
    return () => window.removeEventListener('exampli:statsChanged', onStatsPlus as EventListener);
  }, []);

  // Автопродление отключено — никаких загрузок состояния и переключателей

  // Признак активной подписки: читаем из кэша и обновляем по plus_until
  useEffect(() => {
    try { setIsPlus(Boolean(cacheGet<boolean>(CACHE_KEYS.isPlus))); } catch {}
    const onStatsPlus = (evt: Event) => {
      const e = evt as CustomEvent<{ plus_until?: string } & any>;
      const pu = e.detail?.plus_until;
      if (pu) {
        try {
          const active = new Date(pu).getTime() > Date.now();
          setIsPlus(active);
          cacheSet(CACHE_KEYS.isPlus, active);
        } catch {}
      }
    };
    window.addEventListener('exampli:statsChanged', onStatsPlus as EventListener);
    return () => window.removeEventListener('exampli:statsChanged', onStatsPlus as EventListener);
  }, []);

  // Следим за датой окончания подписки и инициализируем из boot/кэша
  useEffect(() => {
    try {
      const boot = (window as any)?.__exampliBoot;
      const pu0 = boot?.user?.plus_until || (cacheGet<any>(CACHE_KEYS.user)?.plus_until);
      if (pu0) setPlusUntil(String(pu0));
    } catch {}
    const onPlusUntil = (evt: Event) => {
      const e = evt as CustomEvent<{ plus_until?: string } & any>;
      if (e.detail?.plus_until) setPlusUntil(String(e.detail.plus_until));
    };
    window.addEventListener('exampli:statsChanged', onPlusUntil as EventListener);
    return () => window.removeEventListener('exampli:statsChanged', onPlusUntil as EventListener);
  }, []);

  const formatPlusDate = (iso: string | null) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
    } catch { return String(iso); }
  };

  async function createPaymentAndRedirect(kind: 'plan' | 'gems', id: string) {
    if (loadingId) return;
    setLoadingId(`${kind}:${id}`);
    try {
      const boot: any = (window as any).__exampliBoot || {};
      const userId = boot?.user?.id || (cacheGet<any>(CACHE_KEYS.user)?.id) || null;
      const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id || (cacheGet<any>(CACHE_KEYS.user)?.tg_id) || null;
      const r = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: kind, id, user_id: userId, tg_id: tgId })
      });
      if (!r.ok) throw new Error('create_failed');
      const js = await r.json();
      const link = js?.invoice_link as string | undefined;
      if (link) {
        const tg = (window as any)?.Telegram?.WebApp;
        try {
          const ok = tg?.openInvoice?.(link, (status: any) => {
            if (status === 'paid') {
              // мгновенный апдейт без ожидания вебхука
              void (async () => {
                try { await refreshCoinsFromServer(); } catch {}
                try { await refreshPlusUntilFromServer(); } catch {}
              })();
              try { window.dispatchEvent(new CustomEvent('exampli:toast', { detail: { kind: 'success', text: 'Оплата успешно завершена' } } as any)); } catch {}
            } else if (status === 'cancelled') {
              try { window.dispatchEvent(new CustomEvent('exampli:toast', { detail: { kind: 'warn', text: 'Оплата отменена' } } as any)); } catch {}
            }
          });
          if (ok !== true) {
            try { window.dispatchEvent(new CustomEvent('exampli:toast', { detail: { kind: 'error', text: 'Оплата недоступна в этом клиенте' } } as any)); } catch {}
          }
          return;
        } catch {
          try { window.dispatchEvent(new CustomEvent('exampli:toast', { detail: { kind: 'error', text: 'Не удалось открыть оплату' } } as any)); } catch {}
          return;
        }
      }
    } catch (e) {
      try { console.warn('[subscription] create payment failed', e); } catch {}
    } finally {
      setTimeout(() => setLoadingId(null), 400);
    }
  }

  // Вместо поллинга статуса используем событие Telegram WebApp invoiceClosed
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    const handler = (_ev: any) => {
      try { hapticSelect(); } catch {}
      try {
        window.dispatchEvent(new CustomEvent('exampli:toast', { detail: { kind: 'success', text: 'Оплата подтверждена' } } as any));
      } catch {}
      // Обновим баланс монет и статус подписки
      void (async () => { try { await refreshCoinsFromServer(); } catch {} try { await refreshPlusUntilFromServer(); } catch {} })();
    };
    try { tg?.onEvent?.('invoiceClosed', handler); } catch {}
    return () => { try { tg?.offEvent?.('invoiceClosed', handler); } catch {} };
  }, []);

  async function refreshCoinsFromServer() {
    const boot: any = (window as any).__exampliBoot || {};
    const userId = boot?.user?.id || (cacheGet<any>(CACHE_KEYS.user)?.id) || null;
    const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id || (cacheGet<any>(CACHE_KEYS.user)?.tg_id) || null;
    let row: any = null;
    if (userId) {
      const { data } = await supabase.from('users').select('id, coins').eq('id', userId).maybeSingle();
      row = data || null;
    } else if (tgId) {
      const { data } = await supabase.from('users').select('id, coins').eq('tg_id', String(tgId)).maybeSingle();
      row = data || null;
    }
    const newCoins = Number(row?.coins ?? NaN);
    if (Number.isFinite(newCoins)) {
      setCoins(newCoins);
      try {
        const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
        cacheSet(CACHE_KEYS.stats, { ...cs, coins: newCoins });
        window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { coins: newCoins } } as any));
      } catch {}
    }
  }

  async function refreshPlusUntilFromServer() {
    const boot: any = (window as any).__exampliBoot || {};
    const userId = boot?.user?.id || (cacheGet<any>(CACHE_KEYS.user)?.id) || null;
    if (!userId) return;
    const { data } = await supabase.from('users').select('id, plus_until').eq('id', userId).maybeSingle();
    const val = (data as any)?.plus_until || null;
    if (val) {
      try {
        const cu = cacheGet<any>(CACHE_KEYS.user) || {};
        cacheSet(CACHE_KEYS.user, { ...cu, plus_until: val });
        (window as any).__exampliBoot = { ...(window as any).__exampliBoot, user: { ...(boot?.user || {}), plus_until: val } };
        window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { plus_until: val } } as any));
      } catch {}
    }
  }

  // Убрали сохранение и поллинг yk:lastPaymentId — Stars не требует поллинга


  useEffect(() => {
    const flag = sessionStorage.getItem('exampli:highlightCoins');
    if (flag === '1') {
      sessionStorage.removeItem('exampli:highlightCoins');
      setTimeout(() => {
        setHighlight(true);
        try { coinsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
        setTimeout(() => setHighlight(false), 1200);
      }, 100);
    }
    const handler = () => {
      setTimeout(() => {
        setHighlight(true);
        try { coinsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
        setTimeout(() => setHighlight(false), 1200);
      }, 100);
    };
    window.addEventListener('exampli:highlightCoins', handler);
    return () => window.removeEventListener('exampli:highlightCoins', handler);
  }, []);

  return (
    <div className="space-y-6">
      {/* Локальный фиксированный HUD для страницы подписки (только счётчик монет справа) */}
      <div className="hud-fixed hud-compact bg-[var(--bg)]">
        <div className="max-w-xl mx-auto px-5 py-2">
          <div className="grid grid-cols-4 items-center">
            <div className="col-span-3" />
            <div className="justify-self-end flex items-center gap-1">
              <img src="/stickers/coin_cat.svg" alt="" className="w-8 h-8 select-none" draggable={false} />
              <span className="text-yellow-300 font-extrabold tabular-nums text-lg">{coins}</span>
            </div>
          </div>
        </div>
      </div>
      {/* верхний баннер больше не нужен — убран */}
      {/* новый SVG сверху карусели, слегка наезжает на неё */}
      {!isPlus && (
        <div className="relative z-20" style={{ marginTop: 'calc(-1 * (var(--hud-h) + 28px))' }}>
          <div className="max-w-xl mx-auto px-5">
            <motion.img
              src={catSrc}
              alt=""
              className="block select-none"
              draggable={false}
              initial={false}
              animate={{ y: catSrc === ahuelCat ? -1 : 0 }} // 👈 «анимированный» кот выше на 6px
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              style={{ width: 128, height: 128, objectFit: 'contain', margin: '0 auto', position: 'relative', top: 62 }} // 👈 фиксированная высота + чуть ниже
            />
          </div>
        </div>
      )}
      {/* Спейсер: опускаем всё содержимое ниже (иконку не трогаем) */}
      {!isPlus && <div style={{ height: '1px' }} />}
      {/* Если подписка активна — вместо карусели показываем изображение и дату истечения */}
      {isPlus && (
        <div className="relative z-20" style={{ marginTop: 'calc(-1 * var(--hud-h) + 12px)' }}>
          <div className="max-w-xl mx-auto px-5">
            <div className="flex items-center justify-center">
              <img
                src="/subs/already_sub_cat.svg"
                alt=""
                className="select-none"
                draggable={false}
                style={{ width: 224, height: 224, objectFit: 'contain', position: 'relative', top: 12, left: 12 }}
                onError={(e) => { try { (e.currentTarget as HTMLImageElement).src = '/subs/sub_cat.svg'; } catch {} }}
              />
            </div>
            <div className="mt-4 text-center">
              <div className="inline-block rounded-2xl p-[6px]" style={{ background: 'linear-gradient(90deg,#38bdf8,#6366f1)' }}>
                <div className="rounded-2xl px-2 py-1 whitespace-nowrap" style={{ background: 'var(--bg)', maxWidth: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="font-extrabold" style={{ color: '#fff', fontSize: 'min(3.6vw, 16px)' }}>
                    Подписка истекает {formatPlusDate(plusUntil)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* карусель тарифов — скрываем если активна подписка */}
      {!isPlus && (
        <div
          ref={viewportRef}
          className="relative z-10 w-full mt-8 overflow-hidden select-none"
          style={{ touchAction: 'pan-x', overscrollBehaviorX: 'contain', overscrollBehaviorY: 'none', paddingInline: 4 }}
        >
          {step > 0 && (
            <motion.div
              key={step} // 👈 заставляет Framer пересчитать dragConstraints, когда step изменился
              ref={trackDragRef}
              className="flex gap-4"
              drag="x"
              dragConstraints={{
                left: -((plans.length - 1) * step) - ALIGN_SHIFT, // было + ALIGN_OFFSET
                right: 0 - ALIGN_SHIFT,                           // было + ALIGN_OFFSET
              }}
              dragMomentum={false}     // 👈 без инерции Framer
              dragElastic={0.001}      // 👈 минимальная «резинка»
              style={{ x }}
              onDragStart={() => { setIsTouching(true); setCatSrc(ahuelCat); }}
              onDragEnd={onDragEnd}
              onDrag={onDrag}
              animate={controls}
            >
              {plans.map((p) => (
                <div
                  key={p.id}
                  data-slide
                  className="shrink-0 rounded-3xl p-5 border border-white/10 bg-white/5"
                  style={{ width: vw || '100%', minWidth: vw || '100%' }} // карточка = ширина вьюпорта
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xl font-bold">
                        {p.title} <span className="font-extrabold" style={{background:'linear-gradient(90deg,#38bdf8,#6366f1,#ec4899,#ef4444)', WebkitBackgroundClip:'text', color:'transparent'}}>PLUS</span>
                      </div>
                      <div className="text-sm text-muted mt-0.5">
                        {p.months === 1 ? '1 месяц' : p.months === 12 ? '12 месяцев' : `${p.months} месяцев`}
                      </div>
                    </div>
                    <div className="text-3xl">∞</div>
                  </div>

                  <div className="mt-4 grid gap-2">
                    <div className="flex items-center gap-2 text-sm"><span className="text-sky-400">✔</span><span>Бесконечная энергия</span></div>
                    <div className="flex items-center gap-2 text-sm"><span className="text-sky-400">✔</span><span>Доступ к <span className="font-semibold" style={{background:'linear-gradient(90deg,#38bdf8,#6366f1)', WebkitBackgroundClip:'text', color:'transparent'}}>КУРСИК AI</span></span></div>
                    <div className="flex items-center gap-2 text-sm"><span className="text-sky-400">✔</span><span>Заморозка стрика</span></div>
                  </div>

                  <div className="mt-5">
                    <PressButton
                      className="w-full rounded-3xl px-5 py-4 font-semibold text-white"
                      baseColor={accentColor}
                      shadowHeight={shadowHeight}
                      darken={darken}
                      onSelectHaptic={hapticSelect}
                      onClick={() => createPaymentAndRedirect('plan', p.id)}
                    >
                      {loadingId === `plan:${p.id}` ? 'Загрузка…' : (
                        <span className="inline-flex items-center gap-2">
                          <span>Купить за</span>
                          <span className="tabular-nums">{toStars(p.price)}</span>
                          <TelegramStarsIcon size={22} />
                        </span>
                      )}
                    </PressButton>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      )}

      {/* Автопродление недоступно при оплате через Telegram Stars */}

      {/* индикаторы — только если нет подписки */}
      {!isPlus && (
        <div className="flex items-center justify-center gap-2">
          {plans.map((_, dotIndex) => {
            const active = isTouching ? idxRef.current : idx; // можно «замораживать» на старте
            return (
              <span
                key={dotIndex}
                className={[
                  'inline-block w-2 h-2 rounded-full transition-all',
                  dotIndex === active ? 'bg-white w-6' : 'bg-white/30',
                ].join(' ')}
              />
            );
          })}
        </div>
      )}

      {/* Заморозка стрика */}
      <div className="relative mt-2 px-1">
        <div className="text-3xl font-extrabold">Заморозка стрика</div>
        <div className="mt-2 grid gap-4">
          {freezes.map((s) => (
            <PressButton
              key={s.id}
              className="w-full rounded-3xl px-4 py-4 text-left text-white"
              baseColor={coinButtonColor}
              shadowHeight={shadowHeight}
              darken={darken}
              onSelectHaptic={hapticSelect}
              onClick={() => { setSheetOpen({ days: s.id === 's1' ? 1 : 2, price: s.coins, icon: s.icon }); }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <img src={s.icon} alt="" className="h-14 w-14 select-none" draggable={false} />
                  <div className="text-xl font-semibold">{s.label}</div>
                </div>
                <div className="flex items-center gap-2">
                  <img src="/stickers/coin_cat.svg" alt="" className="h-6 w-6 select-none" draggable={false} />
                  <div className="text-yellow-300 font-extrabold tabular-nums">{s.coins.toLocaleString('ru-RU')}</div>
                </div>
              </div>
            </PressButton>
          ))}
        </div>
      </div>

      {/* Gems (монеты) */}
      <div ref={coinsRef} className="relative mt-2 px-1">
        {highlight && (
          <motion.div
            className="absolute inset-[-6px] rounded-3xl pointer-events-none"
            initial={{ opacity: 0, scale: 0.992 }}
            animate={{
              opacity: [0, 1, 0.8, 0.4, 0],
              scale: [0.992, 1.008, 1.002, 1.0, 1.0],
              boxShadow: [
                '0 0 0 0px rgba(56,189,248,0.00), 0 0 0 rgba(56,189,248,0.00)',
                '0 0 0 10px rgba(56,189,248,0.70), 0 0 36px rgba(56,189,248,0.50)',
                '0 0 0 6px rgba(56,189,248,0.35), 0 0 22px rgba(56,189,248,0.28)',
                '0 0 0 2px rgba(56,189,248,0.12), 0 0 10px rgba(56,189,248,0.10)',
                '0 0 0 0px rgba(56,189,248,0.00), 0 0 0 rgba(56,189,248,0.00)'
              ],
              backgroundColor: [
                'rgba(56,189,248,0.00)',
                'rgba(56,189,248,0.16)',
                'rgba(56,189,248,0.10)',
                'rgba(56,189,248,0.04)',
                'rgba(56,189,248,0.00)'
              ]
            }}
            transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1], times: [0, 0.2, 0.5, 0.8, 1] }}
          />
        )}
        <div className="text-3xl font-extrabold">Монеты</div>
        <div className="mt-2 grid gap-4">
          {gems.map((g) => {
            const rub = g.rub;
            const stars = toStars(rub);
            return (
              <PressButton
                key={g.id}
                className="w-full rounded-3xl px-4 py-4 text-left text-white"
                baseColor={coinButtonColor}
                shadowHeight={shadowHeight}
                darken={darken}
                onSelectHaptic={hapticSelect}
                onClick={() => createPaymentAndRedirect('gems', g.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <img src={g.icon} alt="" className="h-14 w-14 select-none" draggable={false} />
                    <div className="text-xl font-semibold tabular-nums">{g.amount}</div>
                  </div>
                  <div className="text-white font-extrabold tabular-nums">
                    {loadingId === `gems:${g.id}` ? '...' : (
                      <span className="inline-flex items-center gap-2">
                        <span>{stars}</span>
                        <TelegramStarsIcon size={22} />
                      </span>
                    )}
                  </div>
                </div>
              </PressButton>
            );
          })}
        </div>
      </div>
      {/* Нижняя шторка покупки заморозки */}
      <FreezeSheet
        open={Boolean(sheetOpen)}
        onClose={() => setSheetOpen(null)}
        coins={coins}
        days={(sheetOpen?.days || 1) as 1 | 2}
        price={sheetOpen?.price || 425}
        icon={sheetOpen?.icon || '/shop/streak_1.svg'}
      />
    </div>
  );
}
function TelegramStarsIcon({ size = 20, variant: _variant = 'twemoji' }: { size?: number; variant?: 'twemoji' | 'emoji' | 'svg' }) {
  return (
    <img
      src="/subs/tg_star.svg"
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      aria-hidden
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}


// Универсальная кнопка с «нижней полоской» (box-shadow), мгновенная анимация
function PressButton({
  className = '',
  baseColor,
  shadowHeight = 6,
  darken,
  children,
  onSelectHaptic,
  onClick,
}: {
  className?: string;
  baseColor: string;
  shadowHeight?: number;
  darken: (hex: string, amount?: number) => string;
  children: React.ReactNode;
  onSelectHaptic?: () => void;
  onClick?: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const downPointRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const MOVE_THRESHOLD_PX = 8;
  const shadow = pressed ? `0px 0px 0px ${darken(baseColor, 18)}` : `0px ${shadowHeight}px 0px ${darken(baseColor, 18)}`;
  return (
    <motion.button
      type="button"
      className={className}
      onPointerDown={(e) => { setPressed(true); downPointRef.current = { x: (e as any).clientX, y: (e as any).clientY }; movedRef.current = false; }}
      onPointerMove={(e) => {
        const p = downPointRef.current;
        if (!p) return;
        const dx = Math.abs((e as any).clientX - p.x);
        const dy = Math.abs((e as any).clientY - p.y);
        if (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX) movedRef.current = true;
      }}
      onPointerUp={() => { setPressed(false); }}
      onPointerCancel={() => { setPressed(false); movedRef.current = false; downPointRef.current = null; }}
      onClick={(e) => { if (movedRef.current) { e.preventDefault(); return; } try { onSelectHaptic?.(); } catch {} onClick?.(); }}
      animate={{ y: pressed ? shadowHeight : 0, boxShadow: shadow }}
      transition={{ duration: 0 }}
      style={{ background: baseColor, border: '1px solid rgba(0,0,0,0.08)' }}
    >
      {children}
    </motion.button>
  );
}

// Локальная нижняя шторка для покупки заморозки
function FreezeSheet({ open, onClose, coins, days, price, icon }: { open: boolean; onClose: () => void; coins: number; days: 1 | 2; price: number; icon: string }) {
  if (!open) return null as any;
  const darkenStrong = (hex: string, amount = 32) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount / 100))));
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  };
  return (
    <>
      <div className="sheet-backdrop" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'none', WebkitBackdropFilter: 'none' }} onClick={() => { try { hapticTiny(); } catch {} onClose(); }} />
      <motion.div
        className="sheet-panel"
        initial={{ y: 500, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 500, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        style={{ padding: '18px 16px 18px 16px', background: 'var(--bg)', border: 'none' }}
      >
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-1">
              <img src="/stickers/coin_cat.svg" alt="" className="w-7 h-7 select-none" draggable={false} />
              <span className="text-yellow-300 font-extrabold tabular-nums text-lg">{coins}</span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center">
            <img src={icon} alt="" className="w-28 h-28 select-none" draggable={false} />
          </div>

          <div className="mt-4 text-center">
            <div className="text-xl font-extrabold">Защитить ваш стрик</div>
            <div className="text-base mt-1">
              с <span className="text-sky-400 font-extrabold">{days === 1 ? '1 днём' : '2 днями'} заморозки</span>
            </div>
          </div>

          <div className="mt-6">
            <PressButton
              className="w-full rounded-3xl px-5 py-4 font-extrabold"
              baseColor="#3c73ff"
              shadowHeight={6}
              darken={darkenStrong}
              onSelectHaptic={hapticSelect}
            >
              <div className="flex items-center justify-center gap-2" style={{ color: 'var(--bg)' }}>
                <span>Купить за</span>
                <img src="/stickers/coin_cat.svg" alt="" className="w-6 h-6" />
                <span className="tabular-nums">{price.toLocaleString('ru-RU')}</span>
              </div>
            </PressButton>
          </div>

          <div className="mt-3">
            <button
              type="button"
              className="w-full rounded-3xl px-5 py-4 font-semibold"
              style={{ background: 'var(--bg)', border: 'none' }}
              onClick={() => { try { hapticTiny(); } catch {} onClose(); }}
            >
               <span style={{ color: '#3c73ff' }}>Отменить</span>
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}