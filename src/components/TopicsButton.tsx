import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { hapticTiny } from '../lib/haptics';

export default function TopicsButton({ onOpen }: { onOpen: () => void }) {
  const [topicTitle, setTopicTitle] = useState<string>('Тема');
  const [subtopicTitle, setSubtopicTitle] = useState<string>('Выбрать подтему');

  const CUR_TOPIC_TITLE_KEY = 'exampli:currentTopicTitle';
  const CUR_SUBTOPIC_TITLE_KEY = 'exampli:currentSubtopicTitle';

  // слушаем обновления «бейджа» из TopicsPanel
  useEffect(() => {
    const onBadge = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.topicTitle) setTopicTitle(d.topicTitle);
      if (d.subtopicTitle) setSubtopicTitle(d.subtopicTitle);
      try {
        if (d.topicTitle) localStorage.setItem(CUR_TOPIC_TITLE_KEY, String(d.topicTitle));
        if (d.subtopicTitle) localStorage.setItem(CUR_SUBTOPIC_TITLE_KEY, String(d.subtopicTitle));
      } catch {}
    };
    window.addEventListener('exampli:topicBadge', onBadge as EventListener);
    return () => window.removeEventListener('exampli:topicBadge', onBadge as EventListener);
  }, []);

  // первичное восстановление из локального кэша / boot
  useEffect(() => {
    try {
      const fromLsTopic = localStorage.getItem(CUR_TOPIC_TITLE_KEY);
      const fromLsSub = localStorage.getItem(CUR_SUBTOPIC_TITLE_KEY);
      if (fromLsTopic) setTopicTitle(fromLsTopic);
      if (fromLsSub) setSubtopicTitle(fromLsSub);
    } catch {}

    const onBoot = (e: Event) => {
      const d: any = (e as CustomEvent).detail || {};
      const bt = d?.current_topic_title;
      const bs = d?.current_subtopic_title;
      if (bt) setTopicTitle(bt);
      if (bs) setSubtopicTitle(bs);
    };
    window.addEventListener('exampli:bootData', onBoot as EventListener);
    return () => window.removeEventListener('exampli:bootData', onBoot as EventListener);
  }, []);

  // При смене курса — не сбрасываем текст, но можно повторно подхватить кэш
  useEffect(() => {
    const onCourse = () => {
      try {
        const t = localStorage.getItem(CUR_TOPIC_TITLE_KEY);
        const s = localStorage.getItem(CUR_SUBTOPIC_TITLE_KEY);
        if (t) setTopicTitle(t);
        if (s) setSubtopicTitle(s);
      } catch {}
    };
    window.addEventListener('exampli:courseChanged', onCourse as EventListener);
    return () => window.removeEventListener('exampli:courseChanged', onCourse as EventListener);
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
