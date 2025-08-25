// src/components/panels/TopicsPanel.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AnimatePresence, motion } from 'framer-motion';
import SidePanel from './SidePanel';
import { hapticTiny, hapticSlideReveal, hapticSlideClose } from '../../lib/haptics';

type Subject   = { id: number | string; code: string; title: string };
type Topic     = { id: number | string; subject_id: number | string; title: string; order_index: number };
type Subtopic  = { id: number | string; subject_id?: number | string; topic_id: number | string; title: string; order_index: number };

type Props = { open: boolean; onClose: () => void };

const ACTIVE_KEY = 'exampli:activeSubjectCode';
const CUR_TOPIC_ID_KEY = 'exampli:currentTopicId';
const CUR_SUBTOPIC_ID_KEY = 'exampli:currentSubtopicId';
const CUR_TOPIC_TITLE_KEY = 'exampli:currentTopicTitle';
const CUR_SUBTOPIC_TITLE_KEY = 'exampli:currentSubtopicTitle';

export default function TopicsPanel({ open, onClose }: Props) {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [subsByTopic, setSubsByTopic] = useState<Record<string, Subtopic[]>>({});
  const [expandedTopicId, setExpandedTopicId] = useState<string | number | null>(null);
  const [loading, setLoading] = useState(true);

  // -- helpers: активный курс из localStorage
  const readActiveCode = useCallback(() => {
    try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
  }, []);

  // -- загрузка активного предмета + тем/подтем
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const code = readActiveCode();
      if (!code) { setSubject(null); setTopics([]); setSubsByTopic({}); return; }

      const { data: subj } = await supabase
        .from('subjects')
        .select('id, code, title')
        .eq('code', code)
        .single();
      if (!subj?.id) { setSubject(null); setTopics([]); setSubsByTopic({}); return; }
      setSubject(subj as Subject);

      const { data: tps } = await supabase
        .from('topics')
        .select('id, subject_id, title, order_index')
        .eq('subject_id', subj.id)
        .order('order_index', { ascending: true });

      const tlist = (tps as Topic[]) || [];
      setTopics(tlist);

      // Если ранее был выбран топик — попробуем сразу развернуть его
      try {
        const savedTopicId = localStorage.getItem(CUR_TOPIC_ID_KEY);
        if (savedTopicId) {
          const exists = tlist.some(t => String(t.id) === String(savedTopicId));
          if (exists) setExpandedTopicId(savedTopicId);
          else {
            // очищаем кэш, если топик не принадлежит текущему курсу
            localStorage.removeItem(CUR_TOPIC_ID_KEY);
            localStorage.removeItem(CUR_SUBTOPIC_ID_KEY);
            localStorage.removeItem(CUR_TOPIC_TITLE_KEY);
            localStorage.removeItem(CUR_SUBTOPIC_TITLE_KEY);
            setExpandedTopicId(null);
          }
        }
      } catch {}

      const topicIds = tlist.map(t => t.id);
      let subsData: Subtopic[] = [];
      if (topicIds.length > 0) {
        const { data: subs } = await supabase
          .from('subtopics')
          .select('id, topic_id, title, order_index')
          .in('topic_id', topicIds)
          .order('topic_id', { ascending: true })
          .order('order_index', { ascending: true });
        subsData = (subs as Subtopic[]) || [];
      }

      const map: Record<string, Subtopic[]> = {};
      subsData.forEach(s => {
        const key = String(s.topic_id);
        if (!map[key]) map[key] = [];
        map[key].push(s);
      });
      setSubsByTopic(map);

      // Попробуем восстановить сохранённый выбор из users.current_topic/current_subtopic
      try {
        const boot: any = (window as any).__exampliBoot;
        const userId = boot?.user?.id;
        if (userId) {
          const { data: urow } = await supabase
            .from('users')
            .select('current_topic,current_subtopic')
            .eq('id', userId)
            .single();
          const savedTopicId = (urow as any)?.current_topic ?? null;
          const savedSubtopicId = (urow as any)?.current_subtopic ?? null;
          if (savedTopicId) {
            const tFound = tlist.find(tt => String(tt.id) === String(savedTopicId));
            const stFound = subsData.find(ss => String(ss.id) === String(savedSubtopicId));
            if (tFound && stFound) {
              try {
                localStorage.setItem(CUR_TOPIC_ID_KEY, String(tFound.id));
                localStorage.setItem(CUR_SUBTOPIC_ID_KEY, String(stFound.id));
                localStorage.setItem(CUR_TOPIC_TITLE_KEY, tFound.title);
                localStorage.setItem(CUR_SUBTOPIC_TITLE_KEY, stFound.title);
              } catch {}
              try {
                window.dispatchEvent(new CustomEvent('exampli:topicBadge', {
                  detail: { topicTitle: tFound.title, subtopicTitle: stFound.title },
                }));
              } catch {}
              setExpandedTopicId(String(tFound.id));
            }
          }
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [readActiveCode]);

  // Грузим один раз при монтировании (прогрев панели заранее)
  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    const onCourseChanged = () => { void loadData(); };
    window.addEventListener('exampli:courseChanged', onCourseChanged as EventListener);
    return () => window.removeEventListener('exampli:courseChanged', onCourseChanged as EventListener);
  }, [open, loadData]);

  // выбор подтемы → сообщаем дороге и кнопке, закрываем панель
  const pickSubtopic = useCallback((t: Topic, st: Subtopic) => {
    window.dispatchEvent(new CustomEvent('exampli:subtopicChanged', {
      detail: {
        subjectId: subject?.id,
        topicId: t.id, topicTitle: t.title,
        subtopicId: st.id, subtopicTitle: st.title,
      },
    }));
    // отдельное маленькое событие для кнопки (две строки)
    window.dispatchEvent(new CustomEvent('exampli:topicBadge', {
      detail: { topicTitle: t.title, subtopicTitle: st.title },
    }));

    // Локальный кэш для мгновенного восстановления текста кнопки
    try {
      localStorage.setItem(CUR_TOPIC_ID_KEY, String(t.id));
      localStorage.setItem(CUR_SUBTOPIC_ID_KEY, String(st.id));
      localStorage.setItem(CUR_TOPIC_TITLE_KEY, t.title);
      localStorage.setItem(CUR_SUBTOPIC_TITLE_KEY, st.title);
    } catch {}

    // Сохраняем выбор в БД users: current_topic / current_subtopic
    try {
      const boot: any = (window as any).__exampliBoot;
      const userId = boot?.user?.id;
      if (userId) {
        void supabase
          .from('users')
          .update({ current_topic: t.id, current_subtopic: st.id })
          .eq('id', userId);
      }
    } catch {}
    onClose();
  }, [onClose, subject?.id]);

  const body = useMemo(() => {
    if (loading) {
      return (
        <div className="grid gap-3" style={{ overscrollBehavior: 'contain', touchAction: 'none' }}>
          {Array.from({ length: 6 }).map((_,i)=><div key={i} className="h-16 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />)}
        </div>
      );
    }
    if (!subject) {
      return <div className="card">Курс не выбран.</div>;
    }
    if (!topics.length) {
      return <div className="card">В этом курсе пока нет тем.</div>;
    }

    return (
      <div className="space-y-3" style={{ overscrollBehaviorY: 'contain' }}>
        {topics.map(t => {
          const opened = String(expandedTopicId) === String(t.id);
          const subs = subsByTopic[String(t.id)] || [];
          return (
            <div key={t.id} className="rounded-2xl border border-white/10 overflow-hidden">
              {/* Тема (как на первом скрине) */}
              <button
                onClick={() => {
                  const willOpen = !opened;
                  if (willOpen) hapticSlideReveal();
                  else hapticSlideClose();
                  setExpandedTopicId(willOpen ? t.id : null);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white/[0.06] hover:bg-white/[0.09]"
              >
                <div className="w-11 h-11 rounded-2xl grid place-items-center bg-white/10 text-xl">✚</div>
                <div className="flex-1">
                  <div className="text-base font-semibold">{t.title}</div>
                  {/* прогресс можно добавить позже */}
                </div>
                <motion.span
                  animate={{ rotate: opened ? 90 : 0 }}
                  transition={{ type: 'tween', duration: .18 }}
                  className="text-white/60 text-xl">›</motion.span>
              </button>

              {/* Подтемы (как на втором скрине) */}
              <AnimatePresence initial={false}>
                {opened && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="divide-y divide-white/10"
                    style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
                  >
                    {subs.map(st => (
                      <TapSafeRow key={st.id} onPick={() => { hapticTiny(); pickSubtopic(t, st); }}>
                        {st.title}
                      </TapSafeRow>
                    ))}
                    {!subs.length && (
                      <div className="px-4 py-3 text-sm text-white/60">Подтем пока нет</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  }, [loading, subject, topics, subsByTopic, expandedTopicId, pickSubtopic]);

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={subject?.title || 'Темы'}
      useTelegramBack
      hideLocalClose
    >
      {body}
    </SidePanel>
  );
}

function TapSafeRow({ children, onPick }: { children: React.ReactNode; onPick: () => void }) {
  const tapRef = useRef<{ y: number; t: number } | null>(null);
  return (
    <button
      onMouseDown={(e) => { (e as any).preventDefault?.(); tapRef.current = { y: (e as any).clientY ?? 0, t: Date.now() }; }}
      onPointerDown={(e) => { tapRef.current = { y: (e as any).clientY ?? 0, t: Date.now() }; }}
      onPointerUp={(e) => {
        const y = (e as any).clientY ?? 0;
        const stamp = Date.now();
        const start = tapRef.current;
        const moved = start ? Math.abs(y - start.y) : 999;
        const dt = start ? (stamp - start.t) : 999;
        if (moved < 10 && dt < 350) onPick();
        tapRef.current = null;
      }}
      className="w-full text-left px-4 py-3 hover:bg-white/[0.06]"
    >
      {children}
    </button>
  );
}
