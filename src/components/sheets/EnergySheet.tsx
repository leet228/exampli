import { useEffect, useMemo, useState } from 'react';
import BottomSheet from './BottomSheet';
import { hapticTiny } from '../../lib/haptics';
import { motion } from 'framer-motion';

export default function EnergySheet({ open, onClose }: { open: boolean; onClose: () => void }){
  const [energy, setEnergy] = useState(25);

  useEffect(() => {
    try {
      const cs = (window as any)?.__exampliBoot?.user || null;
      // приоритет: CACHE_KEYS.stats, затем boot.user
      const cached = (window as any)?.localStorage ? null : null;
      const statsRaw = (() => { try { return localStorage.getItem('exampli:' + 'stats'); } catch { return null; } })();
      const stats = statsRaw ? JSON.parse(statsRaw) : null;
      if (stats?.v?.energy != null) { setEnergy(Number(stats.v.energy)); return; }
      if (cs?.energy != null) { setEnergy(Number(cs.energy)); return; }
      setEnergy(25);
    } catch { setEnergy(25); }
  }, [open]);

  const percent = Math.round((energy / 25) * 100);

  return (
    <BottomSheet open={open} onClose={onClose} title="Энергия">
      <div className="progress"><div style={{ width: `${percent}%` }} /></div>
      <div className="mt-2 text-sm text-muted">{energy}/25</div>

      <div className="mt-5">
        <PlusInfinityButton onClick={() => { try { hapticTiny(); } catch {} }} />
      </div>
    </BottomSheet>
  );
}

function PlusInfinityButton({ onClick }: { onClick?: () => void }) {
  // Базовый цвет кнопки (фон): можно заменить под темуыыы
  const base = '#121a23'; // тёмный фон кнопки
  const shadowColor = useMemo(() => darkenHex('#10b981', 0.28), []); // тень считаем от основного цвета (зелёный бренда)
  const press = 8; // высота нижней полоски

  return (
    <motion.button
      whileTap={{ y: press, boxShadow: `0 0 0 0 ${shadowColor}` }}
      transition={{ duration: 0 }}
      onClick={onClick}
      className="relative w-full rounded-2xl px-6 py-5 text-white select-none overflow-hidden"
      style={{
        background: base,
        boxShadow: `0 ${press}px 0 0 ${shadowColor}`,
      }}
    >
      {/* Верхняя плашка с градиентом и заголовком PLUS */}
      <div className="absolute left-0 right-0 top-0 h-8 rounded-t-2xl px-4 flex items-center font-extrabold tracking-wider text-white text-[13px]"
           style={{ background: 'linear-gradient(90deg,#a855f7 0%,#3b82f6 50%,#10b981 100%)' }}>
        PLUS
      </div>

      <div className="flex items-center gap-4 mt-6">
        <img src="/stickers/battery/infin_energy.svg" alt="∞" className="h-12 w-12 rounded-xl" />
        <div className="flex-1 text-left">
          <div className="text-lg font-extrabold">Unbegrenzt</div>
        </div>
        <div className="text-pink-400 font-extrabold tracking-wider">GRATIS-TEST</div>
      </div>
    </motion.button>
  );
}

function darkenHex(hex: string, amount: number): string {
  try {
    const c = hex.replace('#', '');
    const num = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
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