// src/components/panels/TopicsPanel.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AnimatePresence, motion } from 'framer-motion';
import SidePanel from './SidePanel';
import { hapticTiny, hapticSlideReveal, hapticSlideClose } from '../../lib/haptics';

type Subject   = { id: number; code: string; title: string };
type Topic     = { id: number; subject_id: number; title: string; order_index: number };
type Subtopic  = { id: number; subject_id: number; topic_id: number; title: string; order_index: number };

type Props = { open: boolean; onClose: () => void };

const ACTIVE_KEY = 'exampli:activeSubjectCode';

export default function TopicsPanel({ open, onClose }: Props) {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [subsByTopic, setSubsByTopic] = useState<Record<number, Subtopic[]>>({});
  const [expandedTopicId, setExpandedTopicId] = useState<number | null>(null);
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

      const topicIds = tlist.map(t => t.id);
      let subsData: Subtopic[] = [];
      if (topicIds.length > 0) {
        const { data: subs } = await supabase
          .from('subtopics')
          .select('id, subject_id, topic_id, title, order_index')
          .in('topic_id', topicIds)
          .order('topic_id', { ascending: true })
          .order('order_index', { ascending: true });
        subsData = (subs as Subtopic[]) || [];
      }

      const map: Record<number, Subtopic[]> = {};
      subsData.forEach(s => {
        if (!map[s.topic_id]) map[s.topic_id] = [];
        map[s.topic_id].push(s);
      });
      setSubsByTopic(map);
    } finally {
      setLoading(false);
    }
  }, [readActiveCode]);

  // грузим при открытии панели (и когда сменился курс извне)
  useEffect(() => { if (open) void loadData(); }, [open, loadData]);
  useEffect(() => {
    const onCourseChanged = () => { if (open) void loadData(); };
    window.addEventListener('exampli:courseChanged', onCourseChanged as EventListener);
    return () => window.removeEventListener('exampli:courseChanged', onCourseChanged as EventListener);
  }, [open, loadData]);

  // выбор подтемы → сообщаем дороге и кнопке, закрываем панель
  function pickSubtopic(t: Topic, st: Subtopic) {
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
    onClose();
  }

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
          const opened = expandedTopicId === t.id;
          const subs = subsByTopic[t.id] || [];
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
  }, [loading, subject, topics, subsByTopic, expandedTopicId]);

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
  const tapRef = useState<{ y: number; t: number } | null>(null)[0] as any;
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
