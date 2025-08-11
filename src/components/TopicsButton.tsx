import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function TopicsButton({ onOpen }: { onOpen: () => void }) {
  const [title, setTitle] = useState('Выбрать тему');

  useEffect(() => {
    // начальный текст из выбранного предмета
    (async () => {
      const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!id) return;
      const { data: user } = await supabase.from('users').select('id').eq('tg_id', String(id)).single();
      if (!user) return;
      const { data: rel } = await supabase.from('user_subjects').select('subject_id').eq('user_id', user.id).limit(1);
      const subjectId = rel?.[0]?.subject_id;
      if (subjectId) {
        const { data: subj } = await supabase.from('subjects').select('title').eq('id', subjectId).single();
        if (subj?.title) setTitle(subj.title);
      }
    })();

    // менять подпись при выборе новой темы
    const onChanged = (e: any) => {
      const t = e?.detail?.title;
      if (t) setTitle(t);
    };
    window.addEventListener('exampli:courseChanged', onChanged);
    return () => window.removeEventListener('exampli:courseChanged', onChanged);
  }, []);

  return (
    <motion.button
      className="topics-pin border border-white/10 rounded-2xl bg-[color:var(--card)]/90 backdrop-blur px-4 py-2 shadow-soft flex items-center gap-2"
      onClick={onOpen}
      whileTap={{ scale: 0.97 }}
    >
      <span className="text-lg">🧩</span>
      <span className="text-sm font-medium truncate max-w-[220px]">{title}</span>
    </motion.button>
  );
}
