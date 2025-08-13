import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Subject = { id: number; code: string; title: string; level: string };

type Props = {
  // Режим панели (как у тебя в Home.tsx)
  open?: boolean;
  onClose?: () => void;

  // Режим «контент для шторки» (как в HUD.tsx)
  onPicked?: (s: Subject) => void;
  onAddClick?: () => void;
};

export default function TopicsPanel(props: Props) {
  const { open, onClose, onPicked, onAddClick } = props;

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeCode, setActiveCode] = useState<string | null>(null);

  useEffect(() => {
    // грузим только когда:
    //  - либо мы в режиме панели и она открыта,
    //  - либо мы в режиме контента (open не передан вообще).
    if (open === false) return;

    (async () => {
      const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!tgId) return;

      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('tg_id', String(tgId))
        .single();

      if (!user?.id) { setSubjects([]); return; }

      // 1) берём subject_id пользователя
      const { data: rel } = await supabase
        .from('user_subjects')
        .select('subject_id')
        .eq('user_id', user.id);

      const ids = (rel || []).map(r => r.subject_id as number);
      if (!ids.length) { setSubjects([]); return; }

      // 2) подтянем сами subjects
      const { data } = await supabase
        .from('subjects')
        .select('id, code, title, level')
        .in('id', ids)
        .order('title');

      setSubjects((data as Subject[]) || []);
      setActiveCode(((data as Subject[] | null)?.[0]?.code) || null);
    })();
  }, [open]);

  // отдельный контент — «сеточка» курсов + «+»
  const Grid = useMemo(() => (
    <div className="grid grid-cols-3 gap-3">
      {subjects.map((s) => {
        const active = s.code === activeCode;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setActiveCode(s.code);
              onPicked?.(s);
            }}
            className={`aspect-square rounded-2xl border flex flex-col items-center justify-center text-center px-2 transition
              ${active ? 'border-[var(--accent)] bg-[color:var(--accent)]/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}
            `}
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
        onClick={() => onAddClick?.()}
        className="aspect-square rounded-2xl border border-dashed border-white/15 bg-white/5 hover:bg-white/10 flex items-center justify-center"
      >
        <div className="flex flex-col items-center">
          <div className="text-2xl">＋</div>
          <div className="text-[10px] text-muted mt-1">Добавить</div>
        </div>
      </button>
    </div>
  ), [subjects, activeCode, onPicked, onAddClick]);

  // Если пропсы open/onClose переданы — рендерим ПАНЕЛЬ (как в Home.tsx).
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
            {Grid}
          </div>
        </aside>
      </>
    );
  }

  // Иначе — просто возвращаем контент (как в HUD TopSheet)
  return <div className="pb-1">{Grid}</div>;
}
