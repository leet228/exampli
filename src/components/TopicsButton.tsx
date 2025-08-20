import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { hapticTiny } from '../lib/haptics';

export default function TopicsButton({ onOpen }: { onOpen: () => void }) {
  const [topicTitle, setTopicTitle] = useState<string>('Тема');
  const [subtopicTitle, setSubtopicTitle] = useState<string>('Выбрать подтему');
  const [top, setTop] = useState(120);

  // слушаем обновления «бейджа» из TopicsPanel
  useEffect(() => {
    const onBadge = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.topicTitle) setTopicTitle(d.topicTitle);
      if (d.subtopicTitle) setSubtopicTitle(d.subtopicTitle);
    };
    window.addEventListener('exampli:topicBadge', onBadge as EventListener);
    return () => window.removeEventListener('exampli:topicBadge', onBadge as EventListener);
  }, []);

  // позиция под HUD
  useEffect(() => {
    const measure = () => {
      const hud = document.querySelector('.hud-fixed') as HTMLElement | null;
      setTop(((hud?.getBoundingClientRect()?.bottom) ?? 88) + 10);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.addEventListener('exampli:overlayToggled', measure);
    const t1=setTimeout(measure,120), t2=setTimeout(measure,500);
    return ()=>{ window.removeEventListener('resize',measure); window.removeEventListener('orientationchange',measure); window.removeEventListener('exampli:overlayToggled',measure); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.button
      type="button"
      className="topics-hero"
      style={{ top }}
      onClick={() => { hapticTiny(); onOpen(); }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="text-left leading-tight">
        <div className="text-[11px] uppercase tracking-wide opacity-90">
          {topicTitle}
        </div>
        <div className="text-[18px] font-extrabold leading-tight">
          {subtopicTitle}
        </div>
      </div>
      <span className="ml-2 text-[18px] opacity-90">▾</span>
    </motion.button>
  );
}
