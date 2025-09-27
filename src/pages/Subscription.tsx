import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { hapticSelect, hapticTiny } from '../lib/haptics';
import { cacheGet, CACHE_KEYS } from '../lib/cache';

type Plan = { id: string; months: number; price: number; title: string };

export default function Subscription() {
  // Общие утилиты для кнопок с «нижней полоской»
  const accentColor = '#3c73ff';
  const shadowHeight = 6;
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

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [idx, setIdx] = useState(0);
  const [highlight, setHighlight] = useState(false);
  const coinsRef = useRef<HTMLDivElement | null>(null);
  const [coins, setCoins] = useState<number>(0);
  const [sheetOpen, setSheetOpen] = useState<null | { days: 1 | 2; price: number; icon: string }>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth || 1;
      const i = Math.round(el.scrollLeft / w);
      setIdx(Math.max(0, Math.min(plans.length - 1, i)));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll as any);
  }, [plans.length]);

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

  // Поймаем возврат c ?paid=1 и покажем лаконичное уведомление
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const paid = url.searchParams.get('paid');
      if (paid === '1') {
        url.searchParams.delete('paid');
        window.history.replaceState({}, '', url.toString());
        // Вибрация + всплывашка через кастомное событие (остальной UI может подписаться)
        try { hapticSelect(); } catch {}
        try {
          window.dispatchEvent(new CustomEvent('exampli:toast', { detail: { kind: 'success', text: 'Оплата прошла успешно' } } as any));
        } catch {}
      }
    } catch {}
  }, []);

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
        body: JSON.stringify({ type: kind, id, user_id: userId, tg_id: tgId, return_url: `${location.origin}/subscription?paid=1` })
      });
      if (!r.ok) throw new Error('create_failed');
      const js = await r.json();
      const url = js?.confirmation_url;
      if (url) {
        // Telegram WebApp: лучше открыть во внешнем браузере
        try { (window as any)?.Telegram?.WebApp?.openLink?.(url, { try_instant_view: false }); return; } catch {}
        location.href = url;
      }
    } catch (e) {
      try { console.warn('[subscription] create payment failed', e); } catch {}
    } finally {
      setTimeout(() => setLoadingId(null), 400);
    }
  }

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
      {/* верхний баннер на всю ширину */}
      <div className="relative left-1/2 right-1/2 ml-[-50vw] mr-[-50vw] w-screen" style={{ marginTop: 'calc(-1 * (var(--hud-h) + 28px))' }}>
        <img src="/shop/upper_pic.svg" alt="" className="w-screen h-auto select-none" draggable={false} />
      </div>
      {/* карусель тарифов */}
      <div
        ref={trackRef}
        className="w-full overflow-x-auto no-scrollbar mt-[-85px]"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        <div className="flex gap-4 px-1" style={{ width: '100%' }}>
          {plans.map((p, i) => (
            <motion.div
              key={p.id}
              className="shrink-0 rounded-3xl p-5 border border-white/10 bg-white/5"
              style={{ minWidth: '100%', scrollSnapAlign: 'start' }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xl font-bold">{p.title} <span className="font-extrabold" style={{background:'linear-gradient(90deg,#38bdf8,#6366f1,#ec4899,#ef4444)', WebkitBackgroundClip:'text', color:'transparent'}}>PLUS</span></div>
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
                  {loadingId === `plan:${p.id}` ? 'Загрузка…' : `Купить за ${p.price.toLocaleString('ru-RU')} ₽`}
                </PressButton>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* индикаторы */}
      <div className="flex items-center justify-center gap-2">
        {plans.map((_, i) => (
          <span
            key={i}
            className={[
              'inline-block w-2 h-2 rounded-full transition-all',
              i === idx ? 'bg-white w-6' : 'bg-white/30',
            ].join(' ')}
          />
        ))}
      </div>

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
                  <div className="text-sky-400 font-extrabold tabular-nums">
                    {loadingId === `gems:${g.id}` ? '...' : `${rub.toLocaleString('ru-RU')} ₽`}
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
  const shadow = pressed ? `0px 0px 0px ${darken(baseColor, 18)}` : `0px ${shadowHeight}px 0px ${darken(baseColor, 18)}`;
  return (
    <motion.button
      type="button"
      className={className}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); try { onSelectHaptic?.(); } catch {} }}
      onPointerCancel={() => setPressed(false)}
      onClick={onClick}
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