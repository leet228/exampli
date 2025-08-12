import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function TopicsButton({ onOpen }: { onOpen: () => void }) {
  const [title, setTitle] = useState('Выбрать тему');
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 120, left: window.innerWidth / 2 });

  // подпись
  useEffect(() => {
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

    const onChanged = (e: any) => { if (e?.detail?.title) setTitle(e.detail.title); };
    window.addEventListener('exampli:courseChanged', onChanged);
    return () => window.removeEventListener('exampli:courseChanged', onChanged);
  }, []);

  // точное позиционирование: по низу HUD и по центру нашего контейнера (не экрана)
  useEffect(() => {
    const measure = () => {
      const hud = document.querySelector('.hud-fixed') as HTMLElement | null;
      const rHud = hud?.getBoundingClientRect();
      const container = document.getElementById('app-container');
      const rC = container?.getBoundingClientRect();
      const top = (rHud?.bottom ?? 88) + 10;
      const left = rC ? rC.left + rC.width / 2 : window.innerWidth / 2;
      setPos({ top, left });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.addEventListener('exampli:overlayToggled', measure); // панель открылась/закрылась
    const t1 = setTimeout(measure, 120);
    const t2 = setTimeout(measure, 500);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.removeEventListener('exampli:overlayToggled', measure);
      clearTimeout(t1); clearTimeout(t2);
    };
  }, []);

  return (
    <motion.button
      type="button"
      className="topics-hero"
      style={{ top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
      onClick={onOpen}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      aria-label="Выбрать тему"
    >
      <span className="mr-2 text-xl">‹</span>
      <span className="mr-2">🧩</span>
      <span className="font-semibold">{title}</span>
      <span className="ml-1 opacity-80">▾</span>
    </motion.button>
  );
}
