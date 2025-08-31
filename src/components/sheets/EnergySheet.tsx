import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import { supabase } from '../../lib/supabase';
import { hapticTiny } from '../../lib/haptics';

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

      <div className="grid gap-3 mt-5">
        <button className="card text-left">
          <div className="font-semibold">Безлимит (демо)</div>
          <div className="text-sm text-muted">Открой супер-режим — скоро</div>
        </button>
        <button
          className="btn w-full"
          onClick={() => { hapticTiny(); alert('Пополнение энергии — скоро'); }}
        >
          + Пополнить
        </button>
      </div>
    </BottomSheet>
  );
}