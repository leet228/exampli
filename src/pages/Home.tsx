// src/pages/Home.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { cacheGet, cacheSet, CACHE_KEYS } from '../lib/cache';
import { supabase } from '../lib/supabase';
import SkillRoad from '../components/SkillRoad';
import LessonRoad from '../components/lessons/LessonRoad';
import LessonStartPopover from '../components/lessons/LessonStartPopover';
async function pingPresence(event: string) {
  try {
    const boot: any = (window as any).__exampliBoot;
    const userId = boot?.user?.id || null;
    if (!userId) return;
    await fetch('/api/presence', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, route: window.location.pathname, event })
    });
  } catch {}
}
import LessonRunnerSheet from '../components/lessons/LessonRunnerSheet';
import TopicsButton from '../components/TopicsButton';
import TopicsPanel from '../components/panels/TopicsPanel';

type RoadItem = { id: string; title: string; subtitle?: string };
type LessonNode = { id: string | number; order_index: number };
type Topic = { id: string | number; subject_id: string | number; title: string; order_index: number };

const ACTIVE_KEY = 'exampli:activeSubjectCode';

export default function Home() {
  // Telegram-пользователь (не обязателен, но оставим для потенциального UI)
  const [tgUser] = useState<any>(() => (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user || null);

  // состояние страницы
  const [items, setItems] = useState<RoadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTopics, setOpenTopics] = useState(false);
  const [lessonPreviewOpen, setLessonPreviewOpen] = useState(false);
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [currentLessonId, setCurrentLessonId] = useState<string | number | null>(null);
  const [lessons, setLessons] = useState<LessonNode[]>([]);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [currentTopicTitle, setCurrentTopicTitle] = useState<string | null>(null);
  const [nextTopicTitle, setNextTopicTitle] = useState<string | null>(null);

  // активный курс
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState<string>('');


  // refs для скролла
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // выбираем реальный скролл-контейнер страницы (учитываем контейнер из AppLayout)
  const getScrollContainer = useCallback((): HTMLElement | null => {
    // 1) локальный контейнер
    const local = scrollRef.current as HTMLElement | null;
    if (local && local.scrollHeight > local.clientHeight + 1) return local;
    // 2) любой .main-scroll повыше
    try {
      const nodes = Array.from(document.querySelectorAll('.main-scroll')) as HTMLElement[];
      const cand = nodes.find((el) => el.scrollHeight > el.clientHeight + 1);
      if (cand) return cand;
    } catch {}
    // 3) фолбэк — окно
    return null;
  }, []);

  // быстрый плавный скролл на заданное дельта-расстояние и ожидание завершения
  const scrollByAndWait = useCallback(async (delta: number): Promise<void> => {
    return new Promise<void>((resolve) => {
      try {
        const container = getScrollContainer();
        const start = container ? container.scrollTop : window.scrollY;
        const target = Math.max(0, start + delta);
        const t0 = Date.now();
        const timeoutMs = 600; // быстрый, но с запасом
        if (container) container.scrollTo({ top: target, behavior: 'smooth' });
        else window.scrollTo({ top: target, behavior: 'smooth' });
        const tick = () => {
          const pos = container ? container.scrollTop : window.scrollY;
          if (Math.abs(pos - target) < 2) return resolve();
          if (Date.now() - t0 > timeoutMs) return resolve();
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } catch { resolve(); }
    });
  }, [getScrollContainer]);

  // ======== helpers: localStorage =========
  const readActiveFromStorage = useCallback((): string | null => {
    try { return localStorage.getItem(ACTIVE_KEY) || cacheGet<string>(CACHE_KEYS.activeCourseCode) || null; } catch { return null; }
  }, []);
  const writeActiveToStorage = useCallback((code: string) => {
    try { localStorage.setItem(ACTIVE_KEY, code); } catch {}
    cacheSet(CACHE_KEYS.activeCourseCode, code);
  }, []);

  // ======== ensureActiveCourse: определяем активный курс (code + title) =========
  const ensureActiveCourse = useCallback(async (): Promise<{ code: string | null; title: string }> => {
    // 1) уже выбран в состоянии
    if (activeCode) return { code: activeCode, title: courseTitle };

    // 2) восстановим из localStorage
    const stored = readActiveFromStorage();
    if (stored) {
      // пытаемся найти заголовок в boot или subjects_all
      let title = '';
      try {
        const boot: any = (window as any).__exampliBoot;
        const inUser = (boot?.subjects || []).find((s: any) => s.code === stored);
        if (inUser?.title) title = String(inUser.title);
      } catch {}
      if (!title) {
        try {
          const all = cacheGet<any[]>(CACHE_KEYS.subjectsAll) || [];
          const found = all.find((s) => s.code === stored);
          if (found?.title) title = String(found.title);
        } catch {}
      }
      setActiveCode(stored);
      setCourseTitle(title);
      return { code: stored, title };
    }

    // 3) fallback: из boot взять первый курс пользователя
    try {
      const boot: any = (window as any).__exampliBoot;
      const subj = boot?.subjects?.[0];
      if (subj?.code) {
        setActiveCode(subj.code);
        setCourseTitle(subj.title || '');
        writeActiveToStorage(subj.code);
        return { code: subj.code as string, title: (subj.title as string) || '' };
      }
    } catch {}

    return { code: null, title: '' };
  }, [activeCode, courseTitle, readActiveFromStorage, writeActiveToStorage]);

  // ======== fetchLessons: грузим уроки по активному subject (по коду) =========
  const fetchLessons = useCallback(async (codeArg?: string | null) => {
    const code = codeArg ?? activeCode;
    setLoading(true);
    try {
      if (!code) { setItems([]); return; }
      // заголовок курса найдём в boot или subjects_all
      let title = courseTitle;
      if (!title) {
        try {
          const boot: any = (window as any).__exampliBoot;
          const inUser = (boot?.subjects || []).find((s: any) => s.code === code);
          if (inUser?.title) title = String(inUser.title);
        } catch {}
        if (!title) {
          try {
            const all = cacheGet<any[]>(CACHE_KEYS.subjectsAll) || [];
            const found = all.find((s) => s.code === code);
            if (found?.title) title = String(found.title);
          } catch {}
        }
        if (title) setCourseTitle(title);
      }
      // уроки темы: читаем из кэша по current_topic
      let topicId: string | number | null = null;
      let topicTitleLocal: string | null = null;
      try {
        const boot: any = (window as any).__exampliBoot;
        topicId = boot?.current_topic_id ?? boot?.user?.current_topic ?? null;
        topicTitleLocal = boot?.current_topic_title ?? null;
      } catch {}
      // также попробуем из localStorage (самый свежий выбор из TopicsPanel)
      try {
        const savedId = localStorage.getItem('exampli:currentTopicId');
        const savedTitle = localStorage.getItem('exampli:currentTopicTitle');
        if (savedId != null) topicId = savedId;
        if (savedTitle != null) topicTitleLocal = savedTitle;
      } catch {}
      setCurrentTopicTitle(topicTitleLocal || null);
      if (topicId != null) {
        const data = cacheGet<any[]>(CACHE_KEYS.lessonsByTopic(topicId)) || [];
        const nodes: LessonNode[] = (data || []).map((l: any) => ({ id: l.id, order_index: Number(l.order_index || 0) }));
        setLessons(nodes);
        // посчитаем «следующую тему» на основе списка тем активного предмета
        try {
          // найдём id активного предмета по коду
          let subjectId: string | number | null = null;
          try {
            const boot: any = (window as any).__exampliBoot;
            const inUser = (boot?.subjects || []).find((s: any) => s.code === code);
            if (inUser?.id != null) subjectId = inUser.id;
            if (subjectId == null) {
              const all = cacheGet<any[]>(CACHE_KEYS.subjectsAll) || [];
              const found = all.find((s) => s.code === code);
              if (found?.id != null) subjectId = found.id;
            }
          } catch {}
          let topics: Topic[] = [];
          if (subjectId != null) {
            const cached = cacheGet<Topic[]>(CACHE_KEYS.topicsBySubject(subjectId));
            if (cached && Array.isArray(cached) && cached.length) {
              topics = cached;
            } else {
              try {
                const boot: any = (window as any).__exampliBoot;
                const by = (boot?.topicsBySubject || {}) as Record<string, Topic[]>;
                const list = by?.[String(subjectId)] || [];
                topics = (list as any[]) as Topic[];
              } catch {}
            }
          }
          if (Array.isArray(topics) && topics.length) {
            const idx = topics.findIndex(t => String(t.id) === String(topicId));
            const next = idx >= 0 ? topics[idx + 1] : null;
            setNextTopicTitle(next?.title ?? null);
          } else {
            setNextTopicTitle(null);
          }
        } catch {
          setNextTopicTitle(null);
        }
      } else {
        setLessons([]);
        setNextTopicTitle(null);
      }
      // placeholder карточка «нет уроков» через старый список
      const mapped: RoadItem[] = [];
      setItems(mapped);
    } finally {
      setLoading(false);
    }
  }, [activeCode, courseTitle]);

  // ======== первичная загрузка =========
  useEffect(() => {
    (async () => {
      const sel = await ensureActiveCourse();
      await fetchLessons(sel.code);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // На обновление boot — повторим быструю привязку по кэшу
  useEffect(() => {
    const onBoot = () => { void (async () => { const sel = await ensureActiveCourse(); await fetchLessons(sel.code); })(); };
    window.addEventListener('exampli:bootData', onBoot as EventListener);
    return () => window.removeEventListener('exampli:bootData', onBoot as EventListener);
  }, [ensureActiveCourse, fetchLessons]);

  // ======== реакция на смену курса из других частей приложения =========
  useEffect(() => {
    const onChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ title?: string; code?: string }>;
      const code = e.detail?.code || null;
      const title = e.detail?.title || '';
      if (code) {
        setActiveCode(code);
        writeActiveToStorage(code);
      }
      if (title) setCourseTitle(title);
      fetchLessons(code);
    };
    window.addEventListener('exampli:courseChanged', onChanged as EventListener);
    const onTopic = () => { fetchLessons(); };
    window.addEventListener('exampli:topicChanged', onTopic as EventListener);
    const onLessonsChanged = () => { fetchLessons(); };
    window.addEventListener('exampli:lessonsChanged', onLessonsChanged as EventListener);
    const onHomeReselect = () => {
      try {
        const container = getScrollContainer();
        if (container) {
          if ((container.scrollTop || 0) > 1) container.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          if ((window.scrollY || 0) > 1) window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch {}
    };
    window.addEventListener('exampli:homeReselect', onHomeReselect as EventListener);
    return () => window.removeEventListener('exampli:courseChanged', onChanged as EventListener);
  }, [fetchLessons, writeActiveToStorage]);

  // ======== рендер =========
  return (
    <div ref={scrollRef} className="main-scroll overflow-x-hidden" style={{ overflowX: 'hidden' }}>
      {/* плавающая кнопка «Темы» и левая панель */}
      <TopicsButton onOpen={() => setOpenTopics(true)} />

      <TopicsPanel
        open={openTopics}
        onClose={() => setOpenTopics(false)}
      />

      {/* отступ, ещё ближе к баннеру Темы */}
      <div style={{ height: 56 }} />

      {/* состояния */}
      {!activeCode && !loading && (
        <div className="card">
          Курсы не выбраны. Нажми «🧩 Выбрать тему» сверху и добавь курс.
        </div>
      )}

      {loading ? (
        <div className="card">Загружаем уроки…</div>
      ) : lessons.length > 0 ? (
        <div ref={listRef}>
          <LessonRoad
            lessons={lessons}
            currentTopicTitle={currentTopicTitle}
            nextTopicTitle={nextTopicTitle}
            onNextTopic={async () => {
              // найдём следующую тему ещё раз и применим, чтобы не расходиться со стейтом
              try {
                // активный код и subject id
                const sel = await ensureActiveCourse();
                const codeNow = sel.code;
                let subjectId: string | number | null = null;
                try {
                  const boot: any = (window as any).__exampliBoot;
                  const inUser = (boot?.subjects || []).find((s: any) => s.code === codeNow);
                  if (inUser?.id != null) subjectId = inUser.id;
                  if (subjectId == null) {
                    const all = cacheGet<any[]>(CACHE_KEYS.subjectsAll) || [];
                    const found = all.find((s) => s.code === codeNow);
                    if (found?.id != null) subjectId = found.id;
                  }
                } catch {}
                let topics: Topic[] = [];
                if (subjectId != null) {
                  const cached = cacheGet<Topic[]>(CACHE_KEYS.topicsBySubject(subjectId));
                  if (cached && Array.isArray(cached) && cached.length) {
                    topics = cached;
                  } else {
                    try {
                      const boot: any = (window as any).__exampliBoot;
                      const by = (boot?.topicsBySubject || {}) as Record<string, Topic[]>;
                      const list = by?.[String(subjectId)] || [];
                      topics = (list as any[]) as Topic[];
                    } catch {}
                  }
                }
                // текущая тема
                let curId: string | number | null = null;
                try {
                  const boot: any = (window as any).__exampliBoot;
                  curId = boot?.current_topic_id ?? boot?.user?.current_topic ?? null;
                } catch {}
                try {
                  const savedId = localStorage.getItem('exampli:currentTopicId');
                  if (savedId != null) curId = savedId;
                } catch {}
                const idx = topics.findIndex(t => String(t.id) === String(curId));
                const next = idx >= 0 ? topics[idx + 1] : null;
                if (!next) return;
                // мгновенно применим в локальном UI
                try {
                  localStorage.setItem('exampli:currentTopicId', String(next.id));
                  localStorage.setItem('exampli:currentTopicTitle', String(next.title || ''));
                } catch {}
                setCurrentTopicTitle(String(next.title || ''));
                setNextTopicTitle(() => {
                  const nn = topics[topics.findIndex(t => String(t.id) === String(next.id)) + 1];
                  return nn?.title ?? null;
                });
                try { window.dispatchEvent(new CustomEvent('exampli:topicBadge', { detail: { topicTitle: next.title } } as any)); } catch {}
                try { window.dispatchEvent(new CustomEvent('exampli:topicChanged', { detail: { subjectId, topicId: next.id, topicTitle: next.title } } as any)); } catch {}
                // запишем в БД и предзагрузим уроки для кеша
                try {
                  const boot: any = (window as any).__exampliBoot;
                  let userId: string | number | null = boot?.user?.id ?? null;
                  if (!userId) {
                    const tgId: number | undefined = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
                    if (tgId) {
                      const { data: urow } = await supabase
                        .from('users')
                        .select('id')
                        .eq('tg_id', String(tgId))
                        .single();
                      userId = (urow as any)?.id ?? null;
                    }
                  }
                  if (userId) {
                    await supabase.from('users').update({ current_topic: next.id }).eq('id', userId);
                  }
                } catch {}
                try {
                  const { data: lessons } = await supabase
                    .from('lessons')
                    .select('id, topic_id, order_index')
                    .eq('topic_id', next.id)
                    .order('order_index', { ascending: true });
                  const list = (lessons as any[]) || [];
                  try {
                    const key = CACHE_KEYS.lessonsByTopic(next.id as any);
                    const payload = { v: list, e: null } as any;
                    localStorage.setItem(`exampli:${key}`, JSON.stringify(payload));
                  } catch {}
                  try { window.dispatchEvent(new Event('exampli:lessonsChanged')); } catch {}
                } catch {}
              } catch {}
            }}
            onOpen={(id, el) => {
              (async () => {
                // прокрутим дорогу так, чтобы поповер не перекрывал bottomnav
                try {
                  const anchor = el as HTMLElement | null;
                  const bottomNavHeight = 92; // как в .safe-bottom
                  const popoverHeight = 220; // приблизительная высота поповера
                  const margin = 16;
                  if (anchor) {
                    const rect = anchor.getBoundingClientRect();
                    const viewportBottom = window.innerHeight - bottomNavHeight;
                    const overlap = (rect.bottom + popoverHeight + margin) - viewportBottom;
                    if (overlap > 0) {
                      await scrollByAndWait(overlap);
                    }
                  }
                } catch {}
                setCurrentLessonId(id);
                setAnchorEl(el);
                setLessonPreviewOpen(true);
              })();
            }}
          />
        </div>
      ) : (
        <div className="card">В этой теме пока нет уроков.</div>
      )}

      {/* поповер старта под узлом урока */}
      <LessonStartPopover
        open={lessonPreviewOpen}
        anchorEl={anchorEl}
        onClose={() => setLessonPreviewOpen(false)}
        title={courseTitle || 'Урок'}
        onStart={() => {
          // блокируем старт при 0 энергии
          try {
            const stats = cacheGet<any>(CACHE_KEYS.stats);
            const energy = Number(stats?.energy ?? 0);
            // локально проверяем активную подписку (PLUS) по plus_until из кэша/boot
            const isPlus = (() => {
              try {
                const pu = (cacheGet<any>(CACHE_KEYS.user)?.plus_until) || (window as any)?.__exampliBoot?.user?.plus_until;
                return Boolean(pu && new Date(String(pu)).getTime() > Date.now());
              } catch { return false; }
            })();
            if ((!energy || energy <= 0) && !isPlus) {
              // закрываем поповер и открываем шторку энергии
              setLessonPreviewOpen(false);
              try { window.dispatchEvent(new Event('exampli:openEnergy')); } catch {}
              return;
            }
          } catch {}
          setLessonPreviewOpen(false);
          try { pingPresence('lesson_start'); } catch {}
          setRunnerOpen(true);
        }}
      />

      {/* раннер */}
      {currentLessonId != null && (
        <LessonRunnerSheet
          open={runnerOpen}
          onClose={() => setRunnerOpen(false)}
          lessonId={currentLessonId}
        />
      )}
    </div>
  );
}