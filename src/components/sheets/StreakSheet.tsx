import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import { apiUser } from '../../lib/api';

export default function StreakSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const u = await apiUser(); // берем из users.streak новой БД
        const val = typeof u?.streak === 'number' ? u.streak : 0;
        setStreak(Math.max(0, val));
      } catch {
        // молча оставляем 0
      }
    })();
  }, [open]);

  // Упрощённая сетка на месяц
  const days = Array.from({ length: 30 }, (_, i) => i + 1);

  return (
    <BottomSheet open={open} onClose={onClose} title="Стрик">
      <div className="card">
        <div className="text-3xl font-bold">🔥 {streak}</div>
        <div className="text-sm text-muted">дней подряд</div>
      </div>

      <div className="grid grid-cols-7 gap-2 mt-4">
        {days.map((d) => (
          <div
            key={d}
            className={`h-9 rounded-xl flex items-center justify-center text-sm border ${
              d <= streak ? 'bg-white/10 border-white/10' : 'border-white/5'
            }`}
          >
            {d}
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
