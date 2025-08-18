import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import { supabase } from '../../lib/supabase';

export default function StreakSheet({ open, onClose }: { open: boolean; onClose: () => void }){
  const [streak, setStreak] = useState(0);

  useEffect(() => { (async () => {
    const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!id) return;
    const { data: user } = await supabase.from('users').select('streak').eq('tg_id', String(id)).single();
    setStreak(user?.streak ?? 0);
  })(); }, [open]);

  // Упрощённая сетка на месяц
  const days = Array.from({ length: 30 }, (_, i) => i + 1);

  return (
    <BottomSheet open={open} onClose={onClose} title="Стрик">
      <div className="card">
        <div className="text-3xl font-bold">🔥 {streak}</div>
        <div className="text-sm text-muted">дней подряд</div>
      </div>
      <div className="grid grid-cols-7 gap-2 mt-4">
        {days.map(d => (
          <div key={d} className={`h-9 rounded-xl flex items-center justify-center text-sm border ${d <= streak ? 'bg-white/10 border-white/10' : 'border-white/5'}`}>{d}</div>
        ))}
      </div>
    </BottomSheet>
  );
}