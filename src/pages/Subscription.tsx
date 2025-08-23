import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

type Plan = { id: string; months: number; price: number; title: string };

export default function Subscription() {
  const plans: Plan[] = [
    { id: 'm1', months: 1,  price: 499,  title: 'КУРСИК' },
    { id: 'm6', months: 6,  price: 2699, title: 'КУРСИК' },
    { id: 'm12', months: 12, price: 4999, title: 'КУРСИК' },
  ];

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [idx, setIdx] = useState(0);
  const [highlight, setHighlight] = useState(false);
  const coinsRef = useRef<HTMLDivElement | null>(null);

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
    const flag = sessionStorage.getItem('exampli:highlightCoins');
    if (flag === '1') {
      sessionStorage.removeItem('exampli:highlightCoins');
      setTimeout(() => {
        setHighlight(true);
        try { coinsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
        setTimeout(() => setHighlight(false), 2000);
      }, 100);
    }
    const handler = () => {
      setTimeout(() => {
        setHighlight(true);
        try { coinsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
        setTimeout(() => setHighlight(false), 2000);
      }, 100);
    };
    window.addEventListener('exampli:highlightCoins', handler);
    return () => window.removeEventListener('exampli:highlightCoins', handler);
  }, []);

  return (
    <div className="space-y-6">
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
                  <div className="text-xl font-bold">{p.title} <span style={{background:'linear-gradient(90deg,#38bdf8,#6366f1,#ec4899,#ef4444)', WebkitBackgroundClip:'text', color:'transparent'}}>Plus</span></div>
                  <div className="text-sm text-muted mt-0.5">
                    {p.months === 1 ? '1 месяц' : p.months === 12 ? '12 месяцев' : `${p.months} месяцев`}
                  </div>
                </div>
                <div className="text-3xl">∞</div>
              </div>

              <div className="mt-4 grid gap-2">
                <div className="flex items-center gap-2 text-sm"><span>✔</span><span>Безлимит ⚡ энергии</span></div>
                <div className="flex items-center gap-2 text-sm"><span>✔</span><span>Без рекламы</span></div>
              </div>

              <div className="mt-5">
                <button type="button" className="btn w-full">
                  Купить за {p.price.toLocaleString('ru-RU')} ₽
                </button>
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

      {/* Коины */}
      <div ref={coinsRef} className="relative mt-2 px-1">
        {highlight && (
          <motion.div
            className="absolute inset-[-6px] rounded-3xl pointer-events-none"
            initial={{ opacity: 0, scale: 0.992 }}
            animate={{
              opacity: [0, 1, 0.75, 0.45, 0.0],
              scale: [0.992, 1.01, 1.005, 1.0, 1.0],
              boxShadow: [
                '0 0 0 0px rgba(56,189,248,0.00), 0 0 0 rgba(56,189,248,0.00)',
                '0 0 0 10px rgba(56,189,248,0.85), 0 0 36px rgba(56,189,248,0.65)',
                '0 0 0 8px rgba(56,189,248,0.55), 0 0 28px rgba(56,189,248,0.40)',
                '0 0 0 0px rgba(56,189,248,0.00), 0 0 0 rgba(56,189,248,0.00)'
              ],
              backgroundColor: [
                'rgba(56,189,248,0.00)',
                'rgba(56,189,248,0.18)',
                'rgba(56,189,248,0.12)',
                'rgba(56,189,248,0.00)'
              ]
            }}
            transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1], times: [0, 0.25, 0.7, 1] }}
          />
        )}
        <div className="text-xl font-extrabold">Коины</div>
        <div className="grid gap-3">
          {[{ icon:'💰', amount:1200, price:'99 ₽' }, { icon:'🧺', amount:3000, price:'199 ₽' }, { icon:'🛒', amount:6500, price:'399 ₽' }].map((g,i)=>(
            <div key={i} className="rounded-3xl p-4 border border-white/10 bg-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-3xl" aria-hidden>{g.icon}</div>
                <div className="text-lg font-semibold tabular-nums">{g.amount}</div>
              </div>
              <button type="button" className="btn px-5 py-2">{g.price}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}