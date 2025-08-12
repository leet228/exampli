import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function TopicsButton({ onOpen }: { onOpen: () => void }) {
  const [title, setTitle] = useState('Выбрать тему');
  const [top, setTop] = useState(120);

  useEffect(() => {
    (async () => {
      const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!id) return;
      const { data: u } = await supabase.from('users').select('id').eq('tg_id', String(id)).single();
      if (!u) return;
      const { data: rel } = await supabase.from('user_subjects').select('subject_id').eq('user_id', u.id).limit(1);
      const sid = rel?.[0]?.subject_id;
      if (sid) {
        const { data: s } = await supabase.from('subjects').select('title').eq('id', sid).single();
        if (s?.title) setTitle(s.title);
      }
    })();
    const onChanged = (e:any)=>{ if(e?.detail?.title) setTitle(e.detail.title); };
    window.addEventListener('exampli:courseChanged', onChanged);
    return ()=> window.removeEventListener('exampli:courseChanged', onChanged);
  }, []);

  // позиция по вертикали = низ HUD + 10px
  useEffect(() => {
    const measure = () => {
      const hud = document.querySelector('.hud-fixed') as HTMLElement | null;
      setTop(((hud?.getBoundingClientRect()?.bottom) ?? 88) + 10);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.addEventListener('exampli:overlayToggled', measure); // панель открылась/закрылась
    const t1=setTimeout(measure,120), t2=setTimeout(measure,500);
    return ()=>{ window.removeEventListener('resize',measure); window.removeEventListener('orientationchange',measure); window.removeEventListener('exampli:overlayToggled',measure); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.button type="button" className="topics-hero" style={{ top }}
      onClick={onOpen} whileHover={{scale:1.02}} whileTap={{scale:0.98}}>
      <span className="mr-1 text-xl">‹</span>
      <span className="mr-1">🧩</span>
      <span className="font-semibold">{title}</span>
      <span className="ml-1 opacity-80">▾</span>
    </motion.button>
  );
}
