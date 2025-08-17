import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import { apiUser } from '../../lib/api';

export default function EnergySheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [energy, setEnergy] = useState(25); // 0..25

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const u = await apiUser(); // users.energy из новой БД
        const val = typeof u?.energy === 'number' ? u.energy : 25;
        const clamped = Math.max(0, Math.min(25, val));
        setEnergy(clamped);
      } catch {
        // оставляем дефолт 25 и молча продолжаем
      }
    })();
  }, [open]);

  const percent = Math.round((energy / 25) * 100);

  return (
    <BottomSheet open={open} onClose={onClose} title="Энергия">
      <div className="progress">
        <div style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 text-sm text-muted">
        {energy}/25
      </div>

      <div className="grid gap-3 mt-5">
        <button className="card text-left">
          <div className="font-semibold">Безлимит (демо)</div>
          <div className="text-sm text-muted">Открой супер-режим — скоро</div>
        </button>
        <button
          className="btn w-full"
          onClick={() => alert('Пополнение энергии — скоро')}
        >
          + Пополнить
        </button>
      </div>
    </BottomSheet>
  );
}
