import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function TopicsButton({ onOpen }: { onOpen: () => void }) {
  const [title, setTitle] = useState('Выбрать тему');
  const [top, setTop] = useState<number>(120);

  // подпись из выбранного предмета
  useEffect(() => {
    (async () => {
      const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!id) return;
      const { data: user } = await supabase.from('users').select('id').eq('tg_id', String(id)).single();
      if (!user) return;
      const { data: rel } = await supabase
        .from('user_subjects')
        .select('subject_id')
        .eq('user_id', user.id)
        .limit(1);
      const subjectId = rel?.[0]?.subject_id;
      if (subjectId) {
        const { data: subj } = await supabase.from('subjects').select('title').eq('id', subjectId).single();
        if (subj?.title) setTitle(subj.title);
      }
    })();

    const onChanged = (e: any) => {
      const t = e?.detail?.title;
      if (t) setTitle(t);
    };
    window.addEventListener('exampli:courseChanged', onChanged);
    return () => window.removeEventListener('exampli:courseChanged', onChanged);
  }, []);

  // **главное:** ставим top = нижняя грань HUD + отступ
  useEffect(() => {
    const measure = () => {
      const hud = document.querySelector('.hud-fixed') as HTMLElement | null;
      if (!hud) { setTop(96); return; }
      const r = hud.getBoundingClientRect();
      setTop(Math.max(0, r.bottom + 8)); // прямо под HUD
    };

    measure();
    // на ресайз/ориентацию/переключение тем перепроверяем
    window.addEventListener('resize', measure);
    // иногда шрифт/веб-апп растягивается спустя тик — подстрахуемся
    const t1 = setTimeout(measure, 150);
    const t2 = setTimeout(measure, 600);

    return () => {
      window.removeEventListener('resize', measure);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <motion.button
      type="button"
      style={{ top }}
      className="topics-pin border border-white/10 rounded-2xl px-4 py-2 shadow-soft
                 bg-[color:var(--card)]/90 backdrop-blur flex items-center gap-2
                 active:scale-[0.98] transition"
      onClick={onOpen}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      aria-label="Выбрать тему"
    >
      {/* стиль «как у Дуо»: пиктограмма + яркий бейдж слева и текст */}
      <span className="text-lg">🧩</span>
      <span className="text-sm font-semibold truncate max-w-[220px]">{title}</span>
      <span className="ml-1 text-xs opacity-70">▾</span>
    </motion.button>
  );
}
