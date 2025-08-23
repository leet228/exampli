import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { hapticTiny } from '../lib/haptics';

export default function TopicsButton({ onOpen }: { onOpen: () => void }) {
  const [topicTitle, setTopicTitle] = useState<string>('Тема');
  const [subtopicTitle, setSubtopicTitle] = useState<string>('Выбрать подтему');

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

  // позиционирование теперь полностью на CSS через класс .topics-hero (см. index.css)

  return (
    <motion.button
      type="button"
      className="topics-hero"
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
