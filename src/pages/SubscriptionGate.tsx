import React from 'react';
import { useNavigate } from 'react-router-dom';
import { hapticTiny, hapticSelect } from '../lib/haptics';
import { motion } from 'framer-motion';

export default function SubscriptionGate() {
  const navigate = useNavigate();
  // На время гейта блокируем все глобальные слушатели, которые могли бы триггерить boot/сплэш
  React.useEffect(() => {
    try { (window as any).__exampliBootLocked = true; } catch {}
    // На всякий случай отключим boot‑старт на переходах из этой страницы
    const stopBoot = (e: any) => { try { e?.stopImmediatePropagation?.(); } catch {} };
    window.addEventListener('exampli:startBoot', stopBoot as EventListener, { capture: true } as any);
    return () => {
      try { delete (window as any).__exampliBootLocked; } catch {}
      window.removeEventListener('exampli:startBoot', stopBoot as EventListener, { capture: true } as any);
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[9999]" style={{ background: '#01347a' }}>
      <img src="/subs/sub_pic.svg" alt="Подписка" className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none" style={{ transform: 'translateY(40px)' }} />
      <div className="absolute left-1/2 -translate-x-1/2 bottom-40 w-[min(92%,680px)] px-4">
        <PressCta onClick={() => { try { hapticSelect(); } catch {}; navigate('/subscription'); }}>КУПИТЬ ПОДПИСКУ</PressCta>
      </div>
      <button
        type="button"
        className="absolute left-1/2 -translate-x-1/2 bottom-20 font-extrabold tracking-wider text-[#2f5bff]"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); try { hapticTiny(); } catch {}; navigate('/'); }}
      >
        НЕТ СПАСИБО
      </button>
    </div>
  );
}

function PressCta({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const base = '#3b5bff';
  const dark = shade(base, 0.25);
  const press = 6;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ y: press, boxShadow: `0 0 0 0 ${dark}` }}
      transition={{ duration: 0 }}
      className="w-full rounded-full text-white font-extrabold tracking-wider py-3 text-center"
      style={{ background: base, boxShadow: `0 ${press}px 0 0 ${dark}` }}
    >
      {children}
    </motion.button>
  );
}

function shade(hex: string, amount: number) {
  try {
    const c = hex.replace('#', '');
    const num = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
    let r = (num >> 16) & 0xff;
    let g = (num >> 8) & 0xff;
    let b = num & 0xff;
    r = Math.max(0, Math.min(255, Math.floor(r * (1 - amount))));
    g = Math.max(0, Math.min(255, Math.floor(g * (1 - amount))));
    b = Math.max(0, Math.min(255, Math.floor(b * (1 - amount))));
    const toHex = (v: number) => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch { return hex; }
}


