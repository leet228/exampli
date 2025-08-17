// src/components/panels/TopicsPanel.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiUser, apiTopics, apiSubtopics, apiSetCurrentSelection } from '../../lib/api';

// типы из новой схемы
type Topic = { id: number; topic: string };
type Subtopic = { id: number; subtopic: string };

// локальные ключи
const ACTIVE_COURSE_KEY = 'exampli:activeCourseId';
const ACTIVE_TOPIC_KEY = 'exampli:activeTopicId';
const ACTIVE_SUBTOPIC_KEY = 'exampli:activeSubtopicId';

type Props =
  // режим ПАНЕЛИ (выезжающая слева)
  | { open: boolean; onClose: () => void }
  // режим ВСТАВКИ (контент без контейнера)
  | { open?: undefined; onClose?: undefined };

export default function TopicsPanel(props: Props) {
  const { open, onClose } = props as { open?: boolean; onClose?: () => void };

  const [courseId, setCourseId] = useState<number | null>(null);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);

  // раскрытие конкретной темы -> подгружаем её подтемы по требованию
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [subtopics, setSubtopics] = useState<Record<number, Subtopic[]>>({});
  const [loadingSubs, setLoadingSubs] = useState<Record<number, boolean>>({});

  // выбранные
  const [activeTopicId, setActiveTopicId] = useState<number | null>(null);
  const [activeSubtopicId, setActiveSubtopicId] = useState<number | null>(null);

  // helpers: localStorage
  const readActiveCourse = useCallback((): number | null => {
    try { const v = localStorage.getItem(ACTIVE_COURSE_KEY); return v ? Number(v) : null; } catch { return null; }
  }, []);
  const writeActiveTopic = useCallback((topicId: number | null, subId: number | null) => {
    try {
      if (topicId) localStorage.setItem(ACTIVE_TOPIC_KEY, String(topicId));
      else localStorage.removeItem(ACTIVE_TOPIC_KEY);
      if (subId) localStorage.setItem(ACTIVE_SUBTOPIC_KEY, String(subId));
      else localStorage.removeItem(ACTIVE_SUBTOPIC_KEY);
    } catch {}
  }, []);

  // определить активный курс
  const resolveCourse = useCallback(async () => {
    const stored = readActiveCourse();
    if (stored) { setCourseId(stored); return stored; }
    const u = await apiUser();
    if (u?.current_course_id) { setCourseId(u.current_course_id); return u.current_course_id; }
    setCourseId(null);
    return null;
  }, [readActiveCourse]);

  // загрузить темы курса
  const loadTopics = useCallback(async (cid: number | null) => {
    if (!cid) { setTopics([]); return; }
    setLoadingTopics(true);
    try {
      const list = await apiTopics(cid);
      setTopics(Array.isArray(list) ? list : []);
      // восстановим выбранные из LS
      try {
        const t = localStorage.getItem(ACTIVE_TOPIC_KEY);
        const s = localStorage.getItem(ACTIVE_SUBTOPIC_KEY);
        setActiveTopicId(t ? Number(t) : null);
        setActiveSubtopicId(s ? Number(s) : null);
      } catch {}
    } finally { setLoadingTopics(false); }
  }, []);

  // при открытии панели (или при монтировании в режиме "вставки") — подтянуть курс и темы
  useEffect(() => {
    const needLoad = typeof open === 'boolean' ? open : true;
    if (!needLoad) return;
    (async () => {
      const cid = await resolveCourse();
      await loadTopics(cid);
    })();
  }, [open, resolveCourse, loadTopics]);

  // загрузить подтемы для конкретной темы по требованию
  const ensureSubtopics = useCallback(async (topicId: number) => {
    if (!courseId) return;
    if (subtopics[topicId]) return; // уже загружено
    setLoadingSubs((m) => ({ ...m, [topicId]: true }));
    try {
      const list = await apiSubtopics(courseId, topicId);
      setSubtopics((m) => ({ ...m, [topicId]: (Array.isArray(list) ? list : []) }));
    } finally {
      setLoadingSubs((m) => ({ ...m, [topicId]: false }));
    }
  }, [courseId, subtopics]);

  // клик по теме: раскрыть/свернуть
  const toggleTopic = async (t: Topic) => {
    setExpanded((m) => ({ ...m, [t.id]: !m[t.id] }));
    if (!expanded[t.id]) await ensureSubtopics(t.id);
  };

  // клик по подтеме: сохранить и сообщить наружу
  const pickSubtopic = async (t: Topic, s: Subtopic) => {
    setActiveTopicId(t.id);
    setActiveSubtopicId(s.id);
    writeActiveTopic(t.id, s.id);

    // сохраняем в users: current_course_id/current_topic_id/current_subtopic_id
    if (courseId) {
      await apiSetCurrentSelection({
        course_id: courseId,
        topic_id: t.id,
        subtopic_id: s.id,
      });
    }

    window.dispatchEvent(new CustomEvent('exampli:topicChanged', {
      detail: { course_id: courseId, topic_id: t.id, topic: t.topic, subtopic_id: s.id, subtopic: s.subtopic },
    }));

    onClose?.();
  };

  // отрисовка списка тем
  const list = useMemo(() => {
    if (!courseId) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-muted">
          Сначала выбери курс.
        </div>
      );
    }
    if (loadingTopics) {
      return (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
          ))}
        </div>
      );
    }
    if (!topics.length) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-muted">
          В этом курсе темы ещё не добавлены.
        </div>
      );
    }

    return (
      <div className="grid gap-3">
        {topics.map((t) => {
          const isOpen = !!expanded[t.id];
          const subs = subtopics[t.id] || [];
          const loading = !!loadingSubs[t.id];
          const isActiveTopic = activeTopicId === t.id;

          return (
            <div key={t.id} className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              {/* шапка темы */}
              <button
                type="button"
                className={`w-full flex items-center justify-between px-4 py-3 ${isActiveTopic ? 'bg-[color:var(--accent)]/10 border-b border-white/10' : ''}`}
                onClick={() => toggleTopic(t)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">📚</div>
                  <div className="text-left">
                    <div className="font-semibold">{t.topic}</div>
                    {/* счётчик подтем (если уже загрузили) */}
                    {subtopics[t.id] && (
                      <div className="text-[11px] text-muted">{subs.length} разделов</div>
                    )}
                  </div>
                </div>
                <div className="text-muted">{isOpen ? '▾' : '▸'}</div>
              </button>

              {/* содержимое (подтемы) */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="px-2 pb-2"
                  >
                    {loading ? (
                      <div className="h-10 mx-2 my-2 rounded-xl bg-white/5 border border-white/10 animate-pulse" />
                    ) : subs.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-muted">
                        Подтем пока нет.
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {subs.map((s) => {
                          const active = isActiveTopic && activeSubtopicId === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => pickSubtopic(t, s)}
                              className={`flex items-center justify-between mx-1 my-1 rounded-xl px-3 py-2 border
                                ${active ? 'border-[var(--accent)] bg-[color:var(--accent)]/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}
                              `}
                            >
                              <div className="text-left text-sm">{s.subtopic}</div>
                              <div className="text-muted">›</div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  }, [courseId, loadingTopics, topics, expanded, subtopics, loadingSubs, activeTopicId, activeSubtopicId]);

  // Режим «левая панель»
  if (typeof open === 'boolean') {
    if (!open) return null;
    return (
      <>
        <div className="side-backdrop" onClick={onClose} />
        <aside className="side-panel open">
          <div className="side-panel-header flex items-center justify-center">
            <div className="text-lg font-semibold">Темы</div>
          </div>
          <div className="side-panel-body">
            {list}
          </div>
        </aside>
      </>
    );
  }

  // Режим «контента для TopSheet» (без контейнера)
  return <div className="pb-1">{list}</div>;
}
