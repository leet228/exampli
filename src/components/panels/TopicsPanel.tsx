import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { setUserSubjects } from '../../lib/userState';
import { motion } from 'framer-motion';

type Subject = { id: number; code: string; title: string; level: 'ЕГЭ' | 'ОГЭ' | string };

export default function TopicsPanel({
  onPicked,
  onAddClick,
}: {
  onPicked: (s: Subject) => void;
  onAddClick: () => void;
}) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [currentCode, setCurrentCode] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // активные предметы пользователя
      const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!tgId) return;

      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('tg_id', String(tgId))
        .single();

      const { data: rel } = await supabase
        .from('user_subjects')
        .select('subject:subjects(id,code,title,level)')
        .eq('user_id', user?.id);

      const list = (rel || []).map((r: any) => r.subject) as Subject[];
      setSubjects(list);

      // текущий выбранный курс берём из первого/последнего — на твой вкус
      setCurrentCode(list[0]?.code ?? null);
    })();
  }, []);

  const grid = useMemo(() => subjects, [subjects]);

  return (
    <div className="pb-1">
      <div className="grid grid-cols-3 gap-3">
        {grid.map((s) => {
          const active = s.code === currentCode;
          return (
            <motion.button
              key={s.id}
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={async () => {
                setCurrentCode(s.code);
                await setUserSubjects([s.code]); // выбираем курс
                onPicked(s);
              }}
              className={`aspect-square rounded-2xl border flex flex-col items-center justify-center text-center px-2
                ${active ? 'border-[var(--accent)] bg-[color:var(--accent)]/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}
              `}
            >
              <div className="text-2xl mb-1">📘</div>
              <div className="text-xs font-semibold leading-tight line-clamp-2">{s.title}</div>
              <div className="text-[10px] text-muted mt-0.5">{s.level}</div>
            </motion.button>
          );
        })}

        {/* Плитка "+" */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={onAddClick}
          className="aspect-square rounded-2xl border border-dashed border-white/15 bg-white/5 hover:bg-white/10 flex items-center justify-center"
        >
          <div className="flex flex-col items-center">
            <div className="text-2xl">＋</div>
            <div className="text-[10px] text-muted mt-1">Добавить</div>
          </div>
        </motion.button>
      </div>
    </div>
  );
}
