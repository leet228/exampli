// src/components/panels/TopicsPanel.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { cacheGet, CACHE_KEYS } from '../../lib/cache';
import { motion } from 'framer-motion';
import SidePanel from './SidePanel';
import { hapticTiny } from '../../lib/haptics';

type Subject   = { id: number | string; code: string; title: string };
type Topic     = { id: number | string; subject_id: number | string; title: string; order_index: number };

type Props = { open: boolean; onClose: () => void };

const ACTIVE_KEY = 'exampli:activeSubjectCode';
const CUR_TOPIC_ID_KEY = 'exampli:currentTopicId';
const CUR_TOPIC_TITLE_KEY = 'exampli:currentTopicTitle';

export default function TopicsPanel({ open, onClose }: Props) {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [pressedId, setPressedId] = useState<string | number | null>(null);
  const [currentTopicId, setCurrentTopicId] = useState<string | number | null>(null);

  const readActiveCode = useCallback(() => {
    try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const code = readActiveCode();
      if (!code) { setSubject(null); setTopics([]); return; }
      let subj: Subject | null = null;
      try {
        const all = (cacheGet<Subject[]>(CACHE_KEYS.subjectsAll) || []) as Subject[];
        subj = all.find(s => s.code === code) || null;
      } catch {}
      if (!subj?.id) { setSubject(null); setTopics([]); return; }
      setSubject(subj as Subject);

      let tlist: Topic[] = [];
      try {
        const cached = cacheGet<Topic[]>(CACHE_KEYS.topicsBySubject(subj.id));
        if (cached && Array.isArray(cached)) tlist = cached;
      } catch {}
      setTopics(tlist);

      // восстановим выбранную тему из localStorage/boot
      try {
        const saved = localStorage.getItem('exampli:currentTopicId');
        if (saved) setCurrentTopicId(saved);
        else {
          const boot: any = (window as any).__exampliBoot;
          const ct = boot?.current_topic_id ?? boot?.user?.current_topic ?? null;
          if (ct != null) setCurrentTopicId(ct);
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [readActiveCode]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    const onCourseChanged = () => { void loadData(); };
    window.addEventListener('exampli:courseChanged', onCourseChanged as EventListener);
    return () => window.removeEventListener('exampli:courseChanged', onCourseChanged as EventListener);
  }, [open, loadData]);

  const pickTopic = useCallback(async (t: Topic) => {
    // мгновенный локальный эффект
    try {
      localStorage.setItem(CUR_TOPIC_ID_KEY, String(t.id));
      localStorage.setItem(CUR_TOPIC_TITLE_KEY, t.title);
      localStorage.setItem('exampli:currentTopicOrder', String(t.order_index ?? ''));
    } catch {}
    try { setCurrentTopicId(t.id); } catch {}
    try { window.dispatchEvent(new CustomEvent('exampli:topicBadge', { detail: { topicTitle: t.title } } as any)); } catch {}
    try { window.dispatchEvent(new CustomEvent('exampli:topicChanged', { detail: { subjectId: subject?.id, topicId: t.id, topicTitle: t.title } } as any)); } catch {}

    onClose();

    // запись выбора и загрузка уроков темы — в фоне
    try {
      const boot: any = (window as any).__exampliBoot;
      let userId: string | number | null = boot?.user?.id ?? null;
      if (!userId) {
        try {
          const tgId: number | undefined = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
          if (tgId) {
            const { data: urow } = await supabase
              .from('users')
              .select('id')
              .eq('tg_id', String(tgId))
              .single();
            userId = (urow as any)?.id ?? null;
          }
        } catch {}
      }
      if (userId) {
        await supabase.from('users').update({ current_topic: t.id }).eq('id', userId);
      }
    } catch {}

    // загрузка уроков для темы и кеш
    try {
      const { data: lessons } = await supabase
        .from('lessons')
        .select('id, topic_id, order_index')
        .eq('topic_id', t.id)
        .order('order_index', { ascending: true });
      const list = (lessons as any[]) || [];
      try {
        const key = CACHE_KEYS.lessonsByTopic(t.id as any);
        const payload = { v: list, e: null } as any;
        localStorage.setItem(`exampli:${key}`, JSON.stringify(payload));
      } catch {}
      try { window.dispatchEvent(new Event('exampli:lessonsChanged')); } catch {}
    } catch {}
  }, [onClose, subject?.id]);

  const darken = useCallback((hex: string, amount = 18) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount / 100))));
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  }, []);
  const baseGrey = '#22313a';
  const accentColor = '#3c73ff';
  const shadowHeight = 6;

  const body = useMemo(() => {
    if (loading) {
      return (
        <div className="grid gap-3" style={{ overscrollBehavior: 'contain', touchAction: 'none' }}>
          {Array.from({ length: 6 }).map((_,i)=><div key={i} className="h-16 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />)}
        </div>
      );
    }
    if (!subject) return <div className="card">Курс не выбран.</div>;
    if (!topics.length) return <div className="card">В этом курсе пока нет тем.</div>;

    return (
      <div className="space-y-2" style={{ overscrollBehaviorY: 'contain' }}>
        {topics.map((t) => {
          const selected = String(currentTopicId ?? '') === String(t.id);
          const shade = darken(selected ? accentColor : baseGrey, 18);
          return (
          <motion.button
            key={t.id}
            type="button"
            onPointerDown={() => setPressedId(t.id)}
            onPointerUp={() => setPressedId(null)}
            onPointerCancel={() => setPressedId(null)}
            onClick={() => { hapticTiny(); pickTopic(t); }}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 border bg-white/5"
            animate={{
              y: pressedId === t.id ? shadowHeight : 0,
              boxShadow: pressedId === t.id ? `0px 0px 0px ${shade}` : `0px ${shadowHeight}px 0px ${shade}`,
            }}
            transition={{ duration: 0 }}
            style={{ background: baseGrey, border: `1px solid ${selected ? accentColor : 'rgba(255,255,255,0.1)'}` }}
          >
            <img
              src={(() => {
                try {
                  const key = CACHE_KEYS.topicIconSvg(Number(t.order_index));
                  const cached = cacheGet<string>(key);
                  if (cached) return cached;
                } catch {}
                return `/topics/${t.order_index}.svg`;
              })()}
              alt=""
              className="w-12 h-12 rounded-xl bg-white/10 object-contain p-1 border"
              style={{ borderColor: selected ? accentColor : 'rgba(255,255,255,0.1)' }}
              loading="lazy"
            />
            <div className="flex-1 text-left">
              <div className="text-base font-semibold" style={{ color: selected ? accentColor : undefined }}>{t.title}</div>
            </div>
            <span className="opacity-90" style={{ color: selected ? accentColor : undefined }}>›</span>
          </motion.button>
          );
        })}
      </div>
    );
  }, [loading, subject, topics, pressedId, pickTopic, darken]);

  return (
    <SidePanel open={open} onClose={onClose} title={subject?.title || 'Темы'} useTelegramBack hideLocalClose>
      {body}
    </SidePanel>
  );
}
