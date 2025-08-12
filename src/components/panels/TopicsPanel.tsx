import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SidePanel from './SidePanel';
import { supabase } from '../../lib/supabase';
import { setUserSubjects } from '../../lib/userState';

type Subject = { id: number; code: string; title: string; level: string };

export default function TopicsPanel({
  open, onClose
}: { open: boolean; onClose: () => void }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [openedId, setOpenedId] = useState<number | null>(null);
  const [lessons, setLessons] = useState<Record<number, any[]>>({}); // subject_id -> lessons[]

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.from('subjects').select('*').order('title');
      setSubjects((data as any[]) || []);
    })();
  }, [open]);

  const toggleSubject = async (s: Subject) => {
    setOpenedId(prev => (prev === s.id ? null : s.id));
    if (!lessons[s.id]) {
      const { data } = await supabase
        .from('lessons')
        .select('id, title, order_index')
        .eq('subject_id', s.id)
        .order('order_index');
      setLessons(prev => ({ ...prev, [s.id]: data || [] }));
    }
  };

  const pickSection = async (s: Subject, section: any) => {
    await setUserSubjects([s.code]);
    // Обновим подписи и дорогу
    window.dispatchEvent(new CustomEvent('exampli:courseChanged', { detail: { title: `${s.title}` } }));
    onClose();
  };

  return (
    <SidePanel open={open} onClose={onClose} title="Темы" useTelegramBack hideLocalClose>
      <div className="grid gap-3">
        {subjects.map((s) => {
          const isOpen = openedId === s.id;
          return (
            <div key={s.id} className="rounded-3xl border border-white/10 overflow-hidden bg-white/5">
              <button
                className="w-full flex items-center justify-between px-4 py-3"
                onClick={() => toggleSubject(s)}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">📗</div>
                  <div className="text-left">
                    <div className="font-semibold">{s.title}</div>
                    <div className="text-xs text-muted">{s.level}</div>
                  </div>
                </div>
                <div className={`transition ${isOpen ? 'rotate-90' : ''}`}>›</div>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="border-t border-white/10"
                  >
                    <div className="p-2 grid gap-2">
                      {(lessons[s.id] || []).map((l: any) => (
                        <button
                          key={l.id}
                          className="w-full text-left rounded-2xl px-4 py-3 bg-[color:var(--card)] hover:bg-white/10 transition"
                          onClick={() => pickSection(s, l)}
                        >
                          {l.title}
                        </button>
                      ))}
                      {(lessons[s.id] || []).length === 0 && (
                        <div className="text-xs text-muted px-4 py-3">Пока нет разделов…</div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </SidePanel>
  );
}
