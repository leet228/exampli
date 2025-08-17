import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  apiUser,
  apiUserCourses,
  apiTopics,
  apiSubtopics,
} from '../lib/api';

type Topic = { id: number; topic: string };
type Subtopic = { id: number; subtopic: string };

export default function TopicsButton({ onOpen }: { onOpen: () => void }) {
  const [title, setTitle] = useState('Выбрать тему');
  const [top, setTop] = useState(120);

  useEffect(() => {
    (async () => {
      try {
        const u = await apiUser();

        // 1) определяем активный курс
        let courseId: number | null = null;
        try {
          const v = localStorage.getItem('exampli:activeCourseId');
          if (v) courseId = Number(v);
        } catch {}
        if (!courseId && u?.current_course_id) courseId = Number(u.current_course_id);

        // заголовок по курсу (fallback)
        let courseTitle = '';
        try {
          const list = await apiUserCourses();
          const found = courseId ? list.find(c => c.id === courseId) : list[0];
          if (found) {
            courseId = found.id; // на случай если был null
            courseTitle = found.title;
          }
        } catch {}

        if (!courseId) {
          setTitle('Выбрать тему');
          return;
        }
        const cid = Number(courseId); // <-- теперь точно number

        // 2) если у пользователя сохранены topic/subtopic — пытаемся их показать
        const topicId = u?.current_topic_id != null ? Number(u.current_topic_id) : null;
        const subtopicId =
          u && u.current_subtopic_id != null ? Number(u.current_subtopic_id) : null;

        if (topicId) {
          const topicsRaw = await apiTopics(cid);
          const topics: Topic[] = Array.isArray(topicsRaw) ? (topicsRaw as Topic[]) : [];
          const topic = topics.find(t => t.id === topicId);

          if (topic) {
            if (subtopicId) {
              const subsRaw = await apiSubtopics(cid, topic.id);
              const subs: Subtopic[] = Array.isArray(subsRaw) ? (subsRaw as Subtopic[]) : [];
              const sub = subs.find(s => s.id === subtopicId);
              if (sub && sub.subtopic) {
                setTitle(sub.subtopic);
                return;
              }
            }
            // нет выбранной подтемы — показываем тему
            if (topic.topic) {
              setTitle(topic.topic);
              return;
            }
          }
        }

        // 3) иначе — показываем название курса или заглушку
        setTitle(courseTitle || 'Выбрать тему');
      } catch {
        setTitle('Выбрать тему');
      }
    })();

    // реакции на события
    const onTopicChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ topic?: string; subtopic?: string }>;
      if (e.detail?.subtopic) setTitle(e.detail.subtopic);
      else if (e.detail?.topic) setTitle(e.detail.topic);
    };
    const onCourseChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ title?: string }>;
      if (e.detail?.title) setTitle(e.detail.title);
    };

    window.addEventListener('exampli:topicChanged', onTopicChanged as EventListener);
    window.addEventListener('exampli:courseChanged', onCourseChanged as EventListener);
    return () => {
      window.removeEventListener('exampli:topicChanged', onTopicChanged as EventListener);
      window.removeEventListener('exampli:courseChanged', onCourseChanged as EventListener);
    };
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
    window.addEventListener('exampli:overlayToggled', measure);
    const t1 = setTimeout(measure, 120);
    const t2 = setTimeout(measure, 500);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.removeEventListener('exampli:overlayToggled', measure);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <motion.button
      type="button"
      className="topics-hero"
      style={{ top }}
      onClick={onOpen}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <span className="mr-1 text-xl">‹</span>
      <span className="mr-1" />
      <span className="font-semibold">{title}</span>
      <span className="ml-1 opacity-80">▾</span>
    </motion.button>
  );
}
