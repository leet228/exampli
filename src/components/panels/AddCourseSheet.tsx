import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { addUserSubject } from '../../lib/userState';
import FullScreenSheet from '../sheets/FullScreenSheet';
import { hapticTiny, hapticSelect } from '../../lib/haptics';

type Subject = { id: number; code: string; title: string; level: string };

export default function AddCourseSheet({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (s: Subject) => void;
}) {
  const [all, setAll] = useState<Subject[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('subjects')
        .select('id,code,title,level')
        .order('level', { ascending: true })
        .order('title', { ascending: true });
      setAll((data as Subject[]) || []);
      setPickedId(null);
    })();
  }, [open]);

  const grouped = useMemo(() => {
    const by: Record<string, Subject[]> = {};
    for (const s of all) {
      const key = (s.level || 'Другое').toUpperCase();
      by[key] = by[key] || [];
      by[key].push(s);
    }
    return by;
  }, [all]);

  const picked = useMemo(() => all.find((s) => s.id === pickedId) || null, [all, pickedId]);

  const save = async () => {
    if (!picked) return;
    await addUserSubject(picked.code);
    onAdded(picked);
    onClose();
    window.dispatchEvent(
      new CustomEvent('exampli:courseChanged', {
        detail: { title: picked.title, code: picked.code },
      }),
    );
  };

  return (
    <FullScreenSheet open={open} onClose={onClose} title="Курсы">
      {/* Контент с запасом снизу под фиксированную панель */}
      <div className="space-y-5 pb-28">
        {/* ...твой список */}
      </div>

      {/* Нижняя панель: сплошной фон, разделительная линия, без прозрачности */}
      <div
        className="
          sticky bottom-0 left-0 right-0 z-10
          -mx-4 px-4
          pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]
          bg-[color:var(--surface,#0b0b0c)]
          border-t border-white/10
        "
      >
        <button
          type="button"
          disabled={!picked}
          onClick={() => { hapticSelect(); save(); }}
          className={`w-full rounded-2xl py-4 font-semibold transition
            ${
              picked
                // активная: твой «синий» через существующий класс
                ? 'btn'
                // неактивная: сплошной серый бэкграунд, без прозрачности
                : 'bg-[#2b2d31] text-white/60 border border-white/10 cursor-not-allowed'
            }
          `}
        >
          {picked ? 'Добавить' : 'Выбери курс'}
        </button>
      </div>
    </FullScreenSheet>
  );
}
