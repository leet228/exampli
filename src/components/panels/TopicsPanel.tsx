// src/components/panels/TopicsPanel.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Subject = { id: number; code: string; title: string; level: string };

type Props =
  // Режим ПАНЕЛИ (Home.tsx): показываем левую выезжающую панель
  | { open: boolean; onClose: () => void; onPicked?: (s: Subject) => void; onAddClick?: () => void }
  // Режим ВСТАВКИ в TopSheet (HUD.tsx): просто отдаём контент без контейнера
  | { open?: undefined; onClose?: undefined; onPicked?: (s: Subject) => void; onAddClick?: () => void };

export default function TopicsPanel(props: Props) {
  const { open, onClose, onPicked, onAddClick } = props as {
    open?: boolean;
    onClose?: () => void;
    onPicked?: (s: Subject) => void;
    onAddClick?: () => void;
  };

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Загружаем курсы пользователя
  useEffect(() => {
    // В режиме панели не грузим, пока она закрыта
    if (typeof open === 'boolean' && !open) return;

    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
        if (!tgId) { if (alive) { setSubjects([]); } return; }

        const { data: user } = await supabase.from('users').select('id').eq('tg_id', String(tgId)).single();
        if (!user?.id) { if (alive) setSubjects([]); return; }

        const { data: rel } = await supabase
          .from('user_subjects')
          .select('subject_id')
          .eq('user_id', user.id);

        const ids = (rel || []).map(r => r.subject_id as number);
        if (!ids.length) { if (alive) setSubjects([]); return; }

        const { data } = await supabase
          .from('subjects')
          .select('id, code, title, level')
          .in('id', ids)
          .order('title');

        if (alive) {
          const list = (data as Subject[]) || [];
          setSubjects(list);
          setActiveCode(list[0]?.code ?? null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [open]);

  const grid = useMemo(() => {
    if (loading) {
      return (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
          ))}
        </div>
      );
    }

    if (!subjects.length) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-muted">
          Курсы не выбраны. Нажми «Добавить» ниже.
        </div>
      );
    }

    return (
      <div className="grid grid-cols-3 gap-3">
        {subjects.map((s) => {
          const active = s.code === activeCode;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setActiveCode(s.code);
                if (typeof onPicked === 'function') onPicked(s);
              }}
              className={[
                'aspect-square rounded-2xl border flex flex-col items-center justify-center text-center px-2 transition',
                active ? 'border-[var(--accent)] bg-[color:var(--accent)]/10' : 'border-white/10 bg-white/5 hover:bg-white/10',
              ].join(' ')}
            >
              <div className="text-2xl mb-1">📘</div>
              <div className="text-xs font-semibold leading-tight line-clamp-2">{s.title}</div>
              <div className="text-[10px] text-muted mt-0.5">{s.level}</div>
            </button>
          );
        })}

        {/* Плитка «+ Добавить» */}
        <button
          type="button"
          onClick={() => {
            if (typeof onAddClick === 'function') onAddClick();
            else window.dispatchEvent(new CustomEvent('exampli:addCourse'));
          }}
          className="aspect-square rounded-2xl border border-dashed border-white/15 bg-white/5 hover:bg-white/10 flex items-center justify-center"
        >
          <div className="flex flex-col items-center">
            <div className="text-2xl">＋</div>
            <div className="text-[10px] text-muted mt-1">Добавить</div>
          </div>
        </button>
      </div>
    );
  }, [subjects, activeCode, loading, onPicked, onAddClick]);

  // Режим «панели слева»
  if (typeof open === 'boolean') {
    if (!open) return null;
    return (
      <>
        <div className="side-backdrop" onClick={onClose} />
        <aside className="side-panel">
          <div className="side-panel-header flex items-center justify-center">
            <div className="text-lg font-semibold">Темы</div>
          </div>
          <div className="side-panel-body">
            {grid}
          </div>
        </aside>
      </>
    );
  }

  // Режим «контента для TopSheet» (без контейнера)
  return <div className="pb-1">{grid}</div>;
}
