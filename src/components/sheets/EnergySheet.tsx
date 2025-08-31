import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import { supabase } from '../../lib/supabase';
import { hapticTiny } from '../../lib/haptics';

export default function EnergySheet({ open, onClose }: { open: boolean; onClose: () => void }){
  const [energy, setEnergy] = useState(25);

  useEffect(() => { (async () => {
    const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!id) return;
    const { data: user } = await supabase.from('users').select('energy').eq('tg_id', String(id)).single();
    setEnergy((user?.energy ?? 25) as number);
  })(); }, [open]);

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