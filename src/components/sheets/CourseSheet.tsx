'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import BottomSheet from './BottomSheet';
import { setUserSubjects } from '../../lib/userState';
import { AnimatePresence, motion } from 'framer-motion';

type Subject = {
  id: string;
  title: string;
  level: 'ОГЭ' | 'ЕГЭ' | string;
  code: string;
};

export default function CourseSheet({
  open,
  onClose,
  onPicked,
}: {
  open: boolean;
  onClose: () => void;
  onPicked: (title: string) => void;
}) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [expanded, setExpanded] = useState<'ОГЭ' | 'ЕГЭ' | null>(null);
  const [selected, setSelected] = useState<Subject | null>(null);
  const tg = (typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : undefined);

  // Загружаем курсы при открытии
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('subjects')
        .select('id,title,level,code')
        .order('level', { ascending: true })
        .order('title', { ascending: true });

      setSubjects((data as Subject[]) || []);
    })();
  }, [open]);

  // Telegram BackButton
  useEffect(() => {
    if (!tg) return;
    if (open) {
      tg.BackButton.show();
      const handler = () => onClose();
      tg.onEvent('backButtonClicked', handler);
      return () => {
        tg.offEvent('backButtonClicked', handler);
        tg.BackButton.hide();
      };
    }
  }, [open, onClose, tg]);

  // Группировка по ОГЭ/ЕГЭ
  const grouped = useMemo(() => {
    const by = (lvl: string) => subjects.filter((s) => (s.level || '').toUpperCase().includes(lvl));
    return {
      ОГЭ: by('ОГЭ'),
      ЕГЭ: by('ЕГЭ'),
    };
  }, [subjects]);

  async function addSelected() {
    if (!selected) return;
    // сохраняем выбор пользователя как раньше (массив кодов)
    await setUserSubjects([selected.code]);
    window.dispatchEvent(new CustomEvent('exampli:courseChanged'));
    onPicked(selected.title);
    onClose(); // окно уезжает вниз (анимацию делает BottomSheet)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Курсы">
      <div className="space-y-4">
        {/* Блоки ОГЭ/ЕГЭ */}
        {(['ОГЭ', 'ЕГЭ'] as const).map((cat) => (
          <CategoryBlock
            key={cat}
            title={cat}
            items={grouped[cat]}
            expanded={expanded === cat}
            onToggle={() => setExpanded(expanded === cat ? null : cat)}
            selectedId={selected?.id || null}
            onSelect={(subj) => setSelected(subj)}
          />
        ))}

        {/* Кнопка ДОБАВИТЬ */}
        <button
          onClick={addSelected}
          disabled={!selected}
          className={`w-full h-12 rounded-2xl font-semibold transition
            ${selected ? 'bg-blue-500 text-white active:scale-[0.99]' : 'bg-white/10 text-white/60'}
          `}
        >
          ДОБАВИТЬ
        </button>

        {/* “Крестик телеги” — закрывает мини‑апп, если нужно именно так */}
        <button
          type="button"
          onClick={() => {
            if (tg?.close) tg.close();
            else onClose();
          }}
          className="mx-auto block text-sm text-white/50 hover:text-white"
        >
          Закрыть
        </button>
      </div>
    </BottomSheet>
  );
}

/* ===== Вспомогательный компонент ===== */

function CategoryBlock({
  title,
  items,
  expanded,
  onToggle,
  selectedId,
  onSelect,
}: {
  title: string;
  items: Subject[];
  expanded: boolean;
  onToggle: () => void;
  selectedId: string | null;
  onSelect: (s: Subject) => void;
}) {
  return (
    <div className="rounded-3xl border border-white/10 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.06] hover:bg-white/[0.09] text-white"
      >
        <span className="font-semibold">{title}</span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ type: 'tween', duration: 0.18 }}
          className="text-white/60"
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="divide-y divide-white/10"
          >
            {items.map((s) => {
              const active = selectedId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => onSelect(s)}
                  className={`w-full flex items-center justify-between px-4 py-3 transition
                    ${active
                      ? 'bg-blue-500/10 text-white ring-1 ring-blue-500'
                      : 'text-white/90 hover:bg-white/[0.06]'}
                  `}
                >
                  <div className="font-medium">{s.title}</div>
                  <div className="text-xl">📘</div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
