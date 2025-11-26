import { useEffect, useMemo, useState, useRef, useLayoutEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { hapticSelect, hapticTiny, hapticSuccess, hapticError, hapticStreakMilestone } from '../../lib/haptics';
import BottomSheet from '../sheets/BottomSheet';
import LessonButton from './LessonButton';
import { cacheGet, cacheSet, CACHE_KEYS } from '../../lib/cache';
import { spendEnergy, rewardEnergy, finishLesson } from '../../lib/userState';
import { sfx } from '../../lib/sfx';

const isIOSDevice = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = (navigator as any).platform || '';
  const maxTouchPoints = Number((navigator as any).maxTouchPoints || 0);
  const appleFamily = /iPad|iPhone|iPod/i.test(ua) || /iPad|iPhone|iPod/i.test(platform);
  const macTouch = /Mac/i.test(platform) && maxTouchPoints > 1;
  return appleFamily || macTouch;
})();

type TaskRow = {
  id: number | string;
  lesson_id: number | string;
  prompt: string;
  task_text: string; // contains (underline)
  order_index?: number | null;
  answer_type: 'choice' | 'text' | 'word_letters' | 'cards' | 'multiple_choice' | 'input' | 'connections' | 'num_input' | 'listening' | 'table_num_input' | 'it_code' | 'it_code_2' | 'painting' | 'position';
  options: string[] | null;
  correct: string;
};

type ListeningMeta = {
  src: string;
  topicOrder: number;
  lessonOrder: number;
  topicId: string | number;
};

export default function LessonRunnerSheet({ open, onClose, lessonId }: { open: boolean; onClose: () => void; lessonId: string | number }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [idx, setIdx] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  // Поведенческий режим урока: сначала 15 базовых, затем — повторы ошибок
  const PLANNED_COUNT = 15;
  const [planned, setPlanned] = useState<TaskRow[]>([]);
  const [baseIdx, setBaseIdx] = useState<number>(0);
  const [mode, setMode] = useState<'base' | 'repeat'>('base');
  const [repeatQueue, setRepeatQueue] = useState<TaskRow[]>([]);
  const [repeatCurrent, setRepeatCurrent] = useState<TaskRow | null>(null);
  const lastRepeatOkRef = useRef<boolean | null>(null);
  const [progressCount, setProgressCount] = useState<number>(0); // число плановых, решённых правильно хотя бы раз
  const [choice, setChoice] = useState<string | null>(null);
  const [text, setText] = useState<string>('');
  const [lettersSel, setLettersSel] = useState<number[]>([]); // индексы выбранных букв из options
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [cardBoxRect, setCardBoxRect] = useState<DOMRect | null>(null);
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');
  // Multiple choice (новый тип)
  const [multiSel, setMultiSel] = useState<number[]>([]); // выбранные номера (1..n)
  // Position (упорядочивание)
  const [posOrder, setPosOrder] = useState<number[]>([]); // текущий порядок id (сверху вниз)
  const [posCorrectIds, setPosCorrectIds] = useState<Set<number>>(new Set()); // какие id стояли на «своём» месте до проверки
  const [tableNums, setTableNums] = useState<string[]>([]); // значения для table_num_input
  // Prompt (T) overlay
  const [showT, setShowT] = useState<boolean>(false);
  const [streakLocal, setStreakLocal] = useState<number>(0);
  const [streakFlash, setStreakFlash] = useState<{ v: number; key: number } | null>(null);
  const streakKeyRef = useRef<number>(0);
  const streakCtrl = useAnimation();
  const headerRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [streakLeft, setStreakLeft] = useState<number>(20);
  const [confirmExit, setConfirmExit] = useState<boolean>(false);
  const [showExitAd, setShowExitAd] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [energy, setEnergy] = useState<number>(25);
  const [rewardBonus, setRewardBonus] = useState<0 | 2 | 5>(0);
  const [isPlus, setIsPlus] = useState<boolean>(() => {
    try {
      const pu0 = (window as any)?.__exampliBoot?.user?.plus_until || (cacheGet<any>(CACHE_KEYS.user)?.plus_until);
      return Boolean(pu0 && new Date(String(pu0)).getTime() > Date.now());
    } catch { return false; }
  });
  const rewardKeyRef = useRef<number>(0);
  const solvedRef = useRef<Set<string | number>>(new Set());
  const [viewKey, setViewKey] = useState<number>(0);
  const task = (mode === 'base') ? planned[baseIdx] : (repeatCurrent as any);
  // Метрики завершения урока
  const [answersTotal, setAnswersTotal] = useState<number>(0);
  const [answersCorrect, setAnswersCorrect] = useState<number>(0);
  const [hadAnyMistakes, setHadAnyMistakes] = useState<boolean>(false);
  const [lessonStartedAt, setLessonStartedAt] = useState<number>(0);
  const [showFinish, setShowFinish] = useState<boolean>(false);
  const [finishReady, setFinishReady] = useState<boolean>(false); // все карточки показаны
  const [finishMs, setFinishMs] = useState<number>(0);
  const finishSavedRef = useRef<boolean>(false);
  // Listening audio player state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [listeningPlaying, setListeningPlaying] = useState<boolean>(false);
  const [listeningReady, setListeningReady] = useState<boolean>(false);
  const [listeningProgress, setListeningProgress] = useState<number>(0);
  const [listeningDuration, setListeningDuration] = useState<number>(0);
  const [listeningEnded, setListeningEnded] = useState<boolean>(false);
  const [listeningError, setListeningError] = useState<string | null>(null);
  const [listeningStarted, setListeningStarted] = useState<boolean>(false);
  const listeningRafRef = useRef<number | null>(null);

  const startListeningProgressLoop = useCallback(() => {
    if (listeningRafRef.current != null) return;
    const tick = () => {
      const node = audioRef.current;
      if (node) {
        setListeningProgress(node.currentTime || 0);
      }
      listeningRafRef.current = requestAnimationFrame(tick);
    };
    listeningRafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopListeningProgressLoop = useCallback(() => {
    if (listeningRafRef.current != null) {
      cancelAnimationFrame(listeningRafRef.current);
      listeningRafRef.current = null;
    }
  }, []);
  // Снимок состояния ДО начала урока — нужен для правильной анимации пост-экрана (стрик/квесты)
  const beforeRef = useRef<{ streak: number; last_active_at: string | null; timezone: string | null; yesterdayFrozen: boolean; quests: Record<string, any>; coins: number; streakToday?: boolean; yKind?: 'active' | 'freeze' | '' } | null>(null);

  useEffect(() => {
    if (!open) return;
    // инициируем энергию из кэша
    try {
      const cs = cacheGet<any>(CACHE_KEYS.stats);
      if (cs && typeof cs.energy === 'number') setEnergy(Math.max(0, Math.min(25, Number(cs.energy))));
    } catch {}
    // загрузочный экран и предзагрузка заданий
    setLoading(true);
    (async () => {
      // сначала попробуем из localStorage (кеш урока) — v4
      let rows: any[] | null = null;
      try {
        const v4Key = `exampli:lesson_tasks:v4:${lessonId}`;
        const rawV4 = localStorage.getItem(v4Key);
        if (rawV4) rows = JSON.parse(rawV4) as any[];
      } catch {}
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        let fetched: any[] | null = null;
        try {
          const resp = await fetch(`/api/lesson_tasks?lesson_id=${lessonId}`);
          if (resp.ok) {
            const payload = await resp.json();
            if (payload && Array.isArray(payload.tasks)) {
              fetched = payload.tasks;
            }
          }
        } catch {}
        if ((!fetched || fetched.length === 0)) {
          const { data } = await supabase
            .from('tasks')
            .select('id, lesson_id, prompt, task_text, answer_type, options, correct, order_index')
            .eq('lesson_id', lessonId)
            .order('order_index', { ascending: true })
            .order('id', { ascending: true })
            .limit(50);
          fetched = (data as any[]) || [];
        }
        rows = fetched || [];
        // страховка: отсортировать по order_index, затем id
        rows.sort((a: any, b: any) => {
          const ao = (a?.order_index ?? 0) as number; const bo = (b?.order_index ?? 0) as number;
          if (ao !== bo) return ao - bo;
          return Number(a?.id || 0) - Number(b?.id || 0);
        });
        try {
          // сохраняем в v4 и удаляем старый v3, чтобы не путаться со старыми данными
          localStorage.setItem(`exampli:lesson_tasks:v4:${lessonId}`, JSON.stringify(rows));
          try { localStorage.removeItem(`exampli:lesson_tasks:v3:${lessonId}`); } catch {}
        } catch {}
      }
      setTasks(rows as any);
      const base = (rows as any[]).slice(0, Math.min(PLANNED_COUNT, (rows as any[]).length));
      setPlanned(base as any);
      setBaseIdx(0);
      setMode('base');
      setRepeatQueue([]);
      setRepeatCurrent(null);
      setProgressCount(0);
      solvedRef.current = new Set();
      setIdx(0);
      setProgress(0);
      setChoice(null);
      setText('');
      setItc2Top('');
      setItc2Bottom('');
      setLettersSel([]);
      setSelectedCard(null);
      setCardBoxRect(null);
      setStatus('idle');
      setLoading(false);
      // метрики
      setAnswersTotal(0);
      setAnswersCorrect(0);
      setHadAnyMistakes(false);
      setLessonStartedAt(Date.now());
      setShowFinish(false);
      setFinishReady(false);
      setFinishMs(0);
      finishSavedRef.current = false;
      // Снимок ДО урока для пост-экрана (стрик/дневные задания/монеты)
      try {
        const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
        const cu = cacheGet<any>(CACHE_KEYS.user) || {};
        // snapshot streak days today/yesterday
        let yFrozen = false;
        let streakToday = false;
        let yKind: 'active' | 'freeze' | '' = '';
        try {
          const all = (cacheGet<any[]>(CACHE_KEYS.streakDaysAll) || []) as any[];
          const tz = 'Europe/Moscow';
          const now = new Date();
          const ref = new Date(now.getTime() - 86400000);
          const fmt = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
          const pToday = fmt.formatToParts(now);
          const pad2 = (n: number) => String(n).padStart(2, '0');
          const tIso = `${Number(pToday.find(x=>x.type==='year')?.value||0)}-${pad2(Number(pToday.find(x=>x.type==='month')?.value||0))}-${pad2(Number(pToday.find(x=>x.type==='day')?.value||0))}`;
          streakToday = (all || []).some(r => String(r?.day || '') === tIso);
          const p = fmt.formatToParts(ref);
          const pad = (n: number) => String(n).padStart(2, '0');
          const yIso = `${Number(p.find(x=>x.type==='year')?.value||0)}-${pad(Number(p.find(x=>x.type==='month')?.value||0))}-${pad(Number(p.find(x=>x.type==='day')?.value||0))}`;
          const yRec = (all || []).find(r => String(r?.day || '') === yIso);
          yFrozen = String(yRec?.kind || '') === 'freeze';
          yKind = String(yRec?.kind || '') === 'freeze' ? 'freeze' : (String(yRec?.kind || '') === 'active' ? 'active' : '');
        } catch {}
        const questsMeta = cacheGet<Record<string, any>>(CACHE_KEYS.dailyQuestsProgress) || {};
        const coins0 = Number(cs?.coins ?? 0);
        beforeRef.current = { streak: Number(cs?.streak ?? 0), last_active_at: (cu?.last_active_at ?? null) as any, timezone: (cu?.timezone ?? null) as any, yesterdayFrozen: yFrozen, quests: questsMeta, coins: coins0, streakToday, yKind };
      } catch {}
    })();
  }, [open, lessonId]);

  // Следим за признаком подписки: только по plus_until (никаких boolean-кэшей)
  useEffect(() => {
    try {
      const pu0 = (window as any)?.__exampliBoot?.user?.plus_until || (cacheGet<any>(CACHE_KEYS.user)?.plus_until);
      if (pu0 !== undefined) setIsPlus(Boolean(pu0 && new Date(String(pu0)).getTime() > Date.now()));
    } catch {}
    const onPlus = (evt: Event) => {
      const e = evt as CustomEvent<{ plus_until?: string } & any>;
      if (e.detail?.plus_until !== undefined) {
        try { setIsPlus(Boolean(e.detail.plus_until && new Date(String(e.detail.plus_until)).getTime() > Date.now())); } catch {}
      }
    };
    window.addEventListener('exampli:statsChanged', onPlus as EventListener);
    return () => window.removeEventListener('exampli:statsChanged', onPlus as EventListener);
  }, []);

  useEffect(() => {
    const updatePos = () => {
      try {
        const h = headerRef.current as HTMLElement | null;
        const p = progressRef.current as HTMLElement | null;
        if (!h || !p) return;
        // сначала пробуем offsetLeft относительно ближайшего offsetParent
        let left = p.offsetLeft;
        // фолбэк через bounding rect, если offsetParent другой
        if (!Number.isFinite(left) || left === 0) {
          const hb = h.getBoundingClientRect();
          const pb = p.getBoundingClientRect();
          left = pb.left - hb.left;
        }
        setStreakLeft(Math.max(0, Math.round(left)));
      } catch {}
    };
    const raf = requestAnimationFrame(updatePos);
    window.addEventListener('resize', updatePos);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', updatePos); };
  }, [open, loading, idx, status, streakFlash]);

  // ===== Listening tasks (аудирование) =====
  const listeningMeta = useMemo<ListeningMeta | null>(() => {
    if (!task || task.answer_type !== 'listening') return null;
    let activeCode: string | null = null;
    try {
      activeCode = localStorage.getItem('exampli:activeSubjectCode');
    } catch {}
    if (!activeCode) {
      try {
        const cached = cacheGet<string>(CACHE_KEYS.activeCourseCode);
        if (cached) activeCode = cached;
      } catch {}
    }
    if (!activeCode || activeCode.toLowerCase() !== 'ege_english') return null;

    let topicId: string | number | null = null;
    try {
      const saved = localStorage.getItem('exampli:currentTopicId');
      if (saved) topicId = saved;
    } catch {}
    if (topicId == null) {
      try {
        const boot: any = (window as any)?.__exampliBoot;
        topicId = boot?.current_topic_id ?? boot?.user?.current_topic ?? null;
      } catch {}
    }
    if (topicId == null) return null;

    const subjectId = (() => {
      try {
        const boot: any = (window as any)?.__exampliBoot;
        const found = (boot?.subjects || []).find((s: any) => s.code === activeCode);
        if (found?.id != null) return found.id;
      } catch {}
      try {
        const all = cacheGet<any[]>(CACHE_KEYS.subjectsAll) || [];
        const backup = (all as any[]).find((s: any) => s.code === activeCode);
        if (backup?.id != null) return backup.id;
      } catch {}
      return null;
    })();

    let topicOrder: number | null = null;
    try {
      const storedOrder = localStorage.getItem('exampli:currentTopicOrder');
      if (storedOrder) {
        const parsed = Number(storedOrder);
        if (Number.isFinite(parsed) && parsed > 0) topicOrder = parsed;
      }
    } catch {}
    if ((!topicOrder || !Number.isFinite(topicOrder)) && subjectId != null) {
      let topics: any[] = [];
      try {
        const cached = cacheGet<any[]>(CACHE_KEYS.topicsBySubject(subjectId));
        if (Array.isArray(cached) && cached.length) topics = cached as any[];
      } catch {}
      if (!topics.length) {
        try {
          const boot: any = (window as any)?.__exampliBoot;
          const by = (boot?.topicsBySubject || {}) as Record<string, any[]>;
          const fallback = by[String(subjectId)] || [];
          if (Array.isArray(fallback) && fallback.length) topics = fallback;
        } catch {}
      }
      const foundTopic = topics.find((t) => String(t.id) === String(topicId));
      if (foundTopic?.order_index != null) topicOrder = Number(foundTopic.order_index);
    }
    if (!topicOrder || !Number.isFinite(topicOrder) || topicOrder < 1 || topicOrder > 9) return null;

    const lessonOrder = (() => {
      const candidates: any[][] = [];
      try {
        const cachedLessons = cacheGet<any[]>(CACHE_KEYS.lessonsByTopic(topicId));
        if (Array.isArray(cachedLessons) && cachedLessons.length) candidates.push(cachedLessons as any[]);
      } catch {}
      try {
        const bootLessons = (window as any)?.__exampliBoot?.lessons;
        if (Array.isArray(bootLessons) && bootLessons.length) candidates.push(bootLessons as any[]);
      } catch {}
      for (const list of candidates) {
        const found = list.find((l) => String(l.id) === String(lessonId));
        if (found?.order_index != null) return Number(found.order_index);
      }
      return null;
    })();
    if (!lessonOrder || !Number.isFinite(lessonOrder) || lessonOrder < 1) return null;

    const fileName = lessonOrder === 1 ? 'get_file.mp3' : `get_file (${lessonOrder - 1}).mp3`;
    const src = `/en_ege/${Math.round(topicOrder)}/${encodeURIComponent(fileName)}`;
    return {
      src: `${src}?v=${viewKey}`,
      topicOrder: Math.round(topicOrder),
      lessonOrder: Math.round(lessonOrder),
      topicId,
    };
  }, [task?.id, task?.answer_type, lessonId, viewKey]);

  const resetListeningState = useCallback(() => {
    setListeningPlaying(false);
    setListeningReady(false);
    setListeningProgress(0);
    setListeningDuration(0);
    setListeningEnded(false);
    setListeningError(null);
    setListeningStarted(false);
  }, []);

  const stopListeningAudio = useCallback((resetPosition: boolean = false) => {
    const audio = audioRef.current;
    if (!audio) return;
    try { audio.pause(); } catch {}
    if (resetPosition) {
      try { audio.currentTime = 0; } catch {}
      setListeningProgress(0);
      setListeningEnded(false);
      setListeningStarted(false);
    }
    setListeningPlaying(false);
    stopListeningProgressLoop();
  }, [stopListeningProgressLoop]);

  useEffect(() => {
    if (task?.answer_type !== 'listening') {
      resetListeningState();
      stopListeningAudio(true);
      return;
    }
    resetListeningState();
    stopListeningAudio(true);
  }, [task?.id, viewKey, task?.answer_type, resetListeningState, stopListeningAudio]);

  useEffect(() => {
    if (task?.answer_type !== 'listening') return;
    if (!listeningMeta?.src) {
      setListeningError('Аудио для этого задания пока недоступно');
      return;
    }
    setListeningError(null);
    setListeningEnded(false);
    setListeningStarted(false);
    setListeningPlaying(false);
    setListeningProgress(0);
    const audio = audioRef.current;
    if (!audio) return;
    try { audio.load(); } catch {}
  }, [task?.answer_type, listeningMeta?.src, task?.id, viewKey]);

  useEffect(() => {
    if (task?.answer_type !== 'listening') return;
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => {
      setListeningReady(true);
      setListeningDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setListeningProgress(audio.currentTime || 0);
    };
    const onTime = () => setListeningProgress(audio.currentTime || 0);
    const onPlay = () => {
      setListeningPlaying(true);
      setListeningStarted(true);
      setListeningError(null);
      startListeningProgressLoop();
    };
    const onPause = () => {
      setListeningPlaying(false);
      stopListeningProgressLoop();
    };
    const onEnded = () => {
      setListeningPlaying(false);
      setListeningEnded(true);
      setListeningProgress(Number.isFinite(audio.duration) ? audio.duration : audio.currentTime || 0);
      stopListeningProgressLoop();
    };
    const onError = () => setListeningError('Не удалось воспроизвести аудио');
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      stopListeningProgressLoop();
    };
  }, [task?.answer_type, listeningMeta?.src, task?.id, viewKey, startListeningProgressLoop, stopListeningProgressLoop]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stopListeningProgressLoop();
      } else if (task?.answer_type === 'listening' && listeningPlaying) {
        startListeningProgressLoop();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [listeningPlaying, startListeningProgressLoop, stopListeningProgressLoop, task?.answer_type]);

  useEffect(() => {
    if (!open) stopListeningAudio(true);
  }, [open, stopListeningAudio]);

  useEffect(() => {
    if ((confirmExit || showExitAd) && task?.answer_type === 'listening') {
      stopListeningAudio();
    }
  }, [confirmExit, showExitAd, task?.answer_type, stopListeningAudio]);

  useEffect(() => {
    if (status !== 'idle' && task?.answer_type === 'listening') {
      stopListeningAudio();
    }
  }, [status, task?.answer_type, stopListeningAudio]);

  const handleListeningToggle = useCallback(() => {
    if (task?.answer_type !== 'listening') return;
    if (!listeningMeta?.src || listeningEnded) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (listeningPlaying) {
      try { audio.pause(); } catch {}
      setListeningPlaying(false);
      stopListeningProgressLoop();
    } else {
      try {
        const playPromise = audio.play();
        setListeningPlaying(true);
        setListeningStarted(true);
        setListeningError(null);
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            setListeningError('Разреши воспроизведение, чтобы послушать аудио');
            setListeningPlaying(false);
            stopListeningProgressLoop();
          });
        }
      } catch {
        setListeningError('Не удалось воспроизвести аудио');
        setListeningPlaying(false);
        stopListeningProgressLoop();
      }
    }
  }, [task?.answer_type, listeningMeta?.src, listeningEnded, listeningPlaying, stopListeningProgressLoop]);

  useEffect(() => {
    if (!open || task?.answer_type !== 'listening') {
      stopListeningProgressLoop();
    }
  }, [open, task?.answer_type, stopListeningProgressLoop]);

  const listeningProgressPct = useMemo(() => {
    if (listeningDuration > 0) {
      return Math.max(0, Math.min(100, (listeningProgress / listeningDuration) * 100));
    }
    return listeningEnded ? 100 : (listeningStarted ? 5 : 0);
  }, [listeningProgress, listeningDuration, listeningEnded, listeningStarted]);

  const formatTime = useCallback((value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '--:--';
    const mins = Math.floor(value / 60);
    const secs = Math.floor(value % 60);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(mins)}:${pad(secs)}`;
  }, []);


  const tableColumnCount = useMemo(() => {
    if (task?.answer_type !== 'table_num_input') return 0;
    if (tableNums.length > 0) return tableNums.length;
    return Math.max(1, computeTableColumnCount(task));
  }, [task, tableNums.length]);

  const tableCorrectDigits = useMemo(() => {
    if (task?.answer_type !== 'table_num_input') return [];
    const cols = Math.max(1, tableColumnCount || computeTableColumnCount(task));
    const variants = parseAnswerPipe(task.correct || '');
    const template = String((variants[0] ?? task.correct ?? '') || '');
    return parseCorrectDigits(template, cols).map((d) => String(d));
  }, [task, tableColumnCount]);

  const handleTableCellChange = useCallback((index: number, raw: string) => {
    if (status !== 'idle') return;
    const digit = raw.replace(/[^0-9]/g, '');
    setTableNums((prev) => {
      const len = Math.max(prev.length, index + 1);
      const next = Array.from({ length: len }, (_, i) => prev[i] || '');
      next[index] = digit.slice(-1);
      return next;
    });
  }, [status]);

  // ===== Connections (новый тип ответа) =====
  const connContainerRef = useRef<HTMLDivElement | null>(null);
  const connTaskRefs = useRef<Array<HTMLDivElement | null>>([]);
  const connOptionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [connActiveTask, setConnActiveTask] = useState<number | null>(null); // индекс задачи слева (0..n-1)
  const [connMap, setConnMap] = useState<number[]>([]); // для каждой задачи слева → 1-базный индекс опции справа
  const [connLines, setConnLines] = useState<Array<{ from: { x: number; y: number }; to: { x: number; y: number }; color: string; laneX: number }>>([]);

  const connPalette: string[] = ['#60a5fa', '#34d399', '#f59e0b', '#a78bfa', '#10b981', '#f472b6', '#22d3ee', '#ef4444'];

  function distinctColor(i: number): string {
    // разнесём оттенки по «золотому углу» — устойчиво разные цвета
    const hue = (i * 137.508) % 360;
    return `hsl(${hue}, 70%, 58%)`;
  }

  function parseCorrectDigits(src: string, expectedLen: number): number[] {
    const s = String(src || '').trim();
    const arr: number[] = [];
    for (let i = 0; i < s.length && arr.length < expectedLen; i++) {
      const ch = s[i];
      const d = ch >= '0' && ch <= '9' ? Number(ch) : NaN;
      if (Number.isFinite(d)) arr.push(d);
    }
    while (arr.length < expectedLen) arr.push(0);
    return arr;
  }

  function scheduleConnRecompute(tasksCount: number, optsCount: number, statusNow: 'idle' | 'correct' | 'wrong') {
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        recomputeConnLines(tasksCount, optsCount, statusNow);
      });
      // no need to store raf2 id for cancel; this runs immediately
    });
    return () => cancelAnimationFrame(raf1);
  }

  function recomputeConnLines(tasksCount: number, optsCount: number, statusNow: 'idle' | 'correct' | 'wrong') {
    try {
      const container = connContainerRef.current;
      if (!container || tasksCount <= 0 || optsCount <= 0) { setConnLines([]); return; }
      const cb = container.getBoundingClientRect();
      const correctMap = parseCorrectDigits(task?.correct || '', tasksCount);
      const pre: Array<{ from: { x: number; y: number }; to: { x: number; y: number }; color: string; leftIndex: number }> = [];
      for (let i = 0; i < tasksCount; i++) {
        const leftEl = connTaskRefs.current[i];
        if (!leftEl) continue;
        const lb = leftEl.getBoundingClientRect();
        let optIndex1Based: number = 0;
        if (statusNow === 'idle') {
          optIndex1Based = connMap[i] || 0;
        } else {
          optIndex1Based = correctMap[i] || 0;
        }
        if (!optIndex1Based) continue;
        const rightEl = connOptionRefs.current[optIndex1Based - 1];
        if (!rightEl) continue;
        const rb = rightEl.getBoundingClientRect();
        const from = { x: lb.right - cb.left, y: (lb.top + lb.bottom) / 2 - cb.top };
        const to = { x: rb.left - cb.left, y: (rb.top + rb.bottom) / 2 - cb.top };
        let color = '#ffffff';
        if (statusNow !== 'idle') {
          const isCorrect = (connMap[i] || 0) === (correctMap[i] || 0);
          color = isCorrect ? '#16a34a' : '#dc2626';
        } else {
          // уникальный цвет для каждой линии
          color = distinctColor(i);
        }
        pre.push({ from, to, color, leftIndex: i });
      }
      // разложим вертикальные сегменты по «полосам» около центра, чтобы не перекрывались
      const n = pre.length;
      const centerX = Math.round(cb.width / 2);
      const laneSpacing = 4; // более компактное расстояние между вертикальными «полосами»
      const lines = pre.map((p, idx) => {
        const offset = (idx - (n - 1) / 2) * laneSpacing;
        return { ...p, laneX: centerX + offset };
      });
      setConnLines(lines);
    } catch {
      setConnLines([]);
    }
  }

  // Сброс состояния connections при смене вопроса
  useEffect(() => {
    if (task?.answer_type !== 'connections') return;
    setConnActiveTask(null);
    const left = parseMcOptions(task.task_text || '');
    setConnMap(new Array(Math.max(0, left.length)).fill(0));
    setTimeout(() => recomputeConnLines(left.length, (task.options || [])?.length || 0, status), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, task]);

  // Пересчёт линий при изменениях
  useEffect(() => {
    if (task?.answer_type !== 'connections') return;
    const fx = () => scheduleConnRecompute(parseMcOptions(task.task_text || '').length, (task.options || [])?.length || 0, status);
    const cancel = fx();
    window.addEventListener('resize', fx);
    window.addEventListener('scroll', fx, { passive: true } as any);
    return () => { cancel && cancel(); window.removeEventListener('resize', fx); window.removeEventListener('scroll', fx as any); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, connMap, status]);

  // Дополнительно: пересчёт линий после коммита DOM (refs уже на месте)
  useLayoutEffect(() => {
    if (task?.answer_type !== 'connections') return;
    const leftLen = parseMcOptions(task.task_text || '').length;
    const optsLen = (task.options || [])?.length || 0;
    const cancel = scheduleConnRecompute(leftLen, optsLen, status);
    return () => { cancel && cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, connMap, status, viewKey]);

  // ===== IT CODE editor state =====
  const [codeLang, setCodeLang] = useState<'python' | 'cpp' | 'csharp' | 'java'>('python');
  const [codeBy, setCodeBy] = useState<{ python: string; cpp: string; csharp: string; java: string }>({
    python: '',
    cpp: '',
    csharp: '',
    java: '',
  });
  const [codeOut, setCodeOut] = useState<string[]>([]);
  const [codeRunning, setCodeRunning] = useState<boolean>(false);
  const pyodideRef = useRef<any>(null);
  // it_code_2: два поля ввода (верх/низ)
  const [itc2Top, setItc2Top] = useState<string>('');
  const [itc2Bottom, setItc2Bottom] = useState<string>('');
  const ensurePyodide = useCallback(async () => {
    if (pyodideRef.current) return pyodideRef.current;
    // загрузка скрипта Pyodide один раз
    if (!(window as any).loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Pyodide load failed'));
        document.head.appendChild(s);
      });
    }
    const py = await (window as any).loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full' });
    pyodideRef.current = py;
    return py;
  }, []);

  // ===== Painting (рисовалка) =====
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintBoxRef = useRef<HTMLDivElement | null>(null);
  const PAINT_WORLD_W = 4096;
  const PAINT_WORLD_H = 4096;
  const PAINT_MIN_SCALE = 0.01; // слишком малый масштаб мешал рисованию
  const PAINT_MAX_SCALE = 256;   // достаточно большой зум
  const [paintTool, setPaintTool] = useState<'pen' | 'eraser'>('pen');
  const [paintColor, setPaintColor] = useState<string>('#ffffff');
  const [paintWidth, setPaintWidth] = useState<number>(4);
  const [paintHasDraw, setPaintHasDraw] = useState<boolean>(false);
  const paintDrawingRef = useRef<boolean>(false);
  const paintLastRef = useRef<{ x: number; y: number } | null>(null);
  const paintViewRef = useRef<HTMLDivElement | null>(null);
  const [paintScale, setPaintScale] = useState<number>(1);
  const [paintTx, setPaintTx] = useState<number>(0);
  const [paintTy, setPaintTy] = useState<number>(0);
  const [paintViewportH, setPaintViewportH] = useState<number>(260);
  const paintPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const paintPinchRef = useRef<{
    startDist: number;
    startScale: number;
    startTx: number;
    startTy: number;
    startCx: number;
    startCy: number;
  } | null>(null);
  const paintInitRef = useRef<boolean>(false);

  function resizePaintCanvas() {
    const canvas = paintCanvasRef.current;
    const box = paintBoxRef.current;
    if (!canvas || !box) return;
    // Важно: держим DPR=1 для огромного холста 4096x4096, чтобы не вылетать за лимиты iOS/Telegram WebView
    // 4096*4096 уже ~16.7М пикселей; при DPR>1 будет слишком много памяти, и рисование может «не отображаться»
    const dpr = 1;
    // Рассчитываем высоту видимой области как раньше
    const vw = Math.max(280, Math.round(box.clientWidth));
    const vh = Math.max(220, Math.round(Math.min(360, Math.max(240, Math.floor(box.clientWidth * 0.5)))));
    setPaintViewportH(vh);
    // Огромный «мир» холста, видим только часть (overflow hidden)
    const cssWidth = PAINT_WORLD_W;
    const cssHeight = PAINT_WORLD_H;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = paintColor;
      ctx.lineWidth = Math.max(0.5, paintWidth / Math.max(0.0000001, paintScale));
    }
    // Инициализация масштаба/центровки: показываем «нормальный» старт (как было изначально)
    if (!paintInitRef.current) {
      const vw = Math.max(280, Math.round(box.clientWidth));
      const initScale = 1; // старт без сверхзумов — линии выглядят «не пиксельно»
      setPaintScale(initScale);
      const centerX = PAINT_WORLD_W / 2;
      const centerY = PAINT_WORLD_H / 2;
      const tx0 = vw / 2 - initScale * centerX;
      const ty0 = vh / 2 - initScale * centerY;
      setPaintTx(tx0);
      setPaintTy(ty0);
      paintInitRef.current = true;
    }
  }
  function paintPointFromEvent(e: PointerEvent | React.PointerEvent): { x: number; y: number } {
    const view = paintViewRef.current;
    if (!view) return { x: 0, y: 0 };
    const rect = view.getBoundingClientRect();
    // Переводим координаты экрана в координаты «мира» (делим на масштаб)
    const xw = (e.clientX - rect.left) / Math.max(0.0000001, paintScale);
    const yw = (e.clientY - rect.top) / Math.max(0.0000001, paintScale);
    // Ограничим в пределах канвы, иначе на сверх‑зуме могли уходить «мимо» и ничего не рисовалось
    const x = Math.max(0, Math.min(PAINT_WORLD_W, xw));
    const y = Math.max(0, Math.min(PAINT_WORLD_H, yw));
    return { x, y };
  }
  function paintPointFromClient(clientX: number, clientY: number): { x: number; y: number } {
    const view = paintViewRef.current;
    if (!view) return { x: 0, y: 0 };
    const rect = view.getBoundingClientRect();
    // Переводим координаты экрана в координаты «мира» (делим на масштаб)
    const xw = (clientX - rect.left) / Math.max(0.0000001, paintScale);
    const yw = (clientY - rect.top) / Math.max(0.0000001, paintScale);
    // Ограничим в пределах канвы, иначе на сверх‑зуме могли уходить «мимо» и ничего не рисовалось
    const x = Math.max(0, Math.min(PAINT_WORLD_W, xw));
    const y = Math.max(0, Math.min(PAINT_WORLD_H, yw));
    return { x, y };
  }
  function onPaintDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (status !== 'idle') return;
    // touch pinch setup
    if (e.pointerType === 'touch') {
      paintPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (paintPointersRef.current.size === 2) {
        const arr = Array.from(paintPointersRef.current.values());
        const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
        const cx = (arr[0].x + arr[1].x) / 2;
        const cy = (arr[0].y + arr[1].y) / 2;
        paintPinchRef.current = { startDist: Math.max(1, d), startScale: paintScale, startTx: paintTx, startTy: paintTy, startCx: cx, startCy: cy };
        paintDrawingRef.current = false; // во время пинча не рисуем
        return;
      }
    }
    // На iOS/Android pointer capture для touch иногда ломает доставку move-событий.
    // Для мыши оставляем, для touch — не используем.
    try { if (e.pointerType !== 'touch') (e.target as Element).setPointerCapture(e.pointerId); } catch {}
    paintDrawingRef.current = true;
    const p = paintPointFromEvent(e);
    paintLastRef.current = p;
    const ctx = paintCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = (paintTool === 'eraser') ? 'destination-out' : 'source-over';
    ctx.strokeStyle = paintColor;
    // Делаем толщину визуально постоянной относительно экрана
    ctx.lineWidth = Math.max(0.5, paintWidth / Math.max(0.0000001, paintScale));
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    // Нарисуем минимальную «точку», чтобы штрих был виден сразу
    ctx.lineTo(p.x + 0.001, p.y + 0.001);
    ctx.stroke();
    try { e.preventDefault(); } catch {}
  }
  function onPaintMove(e: React.PointerEvent<HTMLCanvasElement>) {
    // pinch zoom with two fingers
    if (e.pointerType === 'touch' && paintPointersRef.current.has(e.pointerId)) {
      paintPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (paintPointersRef.current.size === 2 && paintPinchRef.current) {
        const arr = Array.from(paintPointersRef.current.values());
        const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
        const cx = (arr[0].x + arr[1].x) / 2;
        const cy = (arr[0].y + arr[1].y) / 2;
        // Рассчитываем масштаб с порогом чувствительности: если дельта <2% — считаем, что это панорама без зума
        const ratioRaw = d / Math.max(1, paintPinchRef.current.startDist);
        const scaleEps = 0.03; // 2%
        const ratio = (Math.abs(ratioRaw - 1) < scaleEps) ? 1 : ratioRaw;
        const nextScale = Math.max(PAINT_MIN_SCALE, Math.min(PAINT_MAX_SCALE, paintPinchRef.current.startScale * ratio));
        setPaintScale(nextScale);
        // Масштаб вокруг текущего центра жеста: удерживаем под пальцами тот же «мировой» пиксель
        const k = nextScale / Math.max(0.0000001, paintPinchRef.current.startScale);
        setPaintTx(cx - k * (paintPinchRef.current.startCx - paintPinchRef.current.startTx));
        setPaintTy(cy - k * (paintPinchRef.current.startCy - paintPinchRef.current.startTy));
        e.preventDefault();
        return;
      }
    }
    if (!paintDrawingRef.current) return;
    const ctx = paintCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = paintPointFromEvent(e);
    const last = paintLastRef.current || p;
    // Обновляем толщину с учётом масштаба
    ctx.lineWidth = Math.max(0.5, paintWidth / Math.max(0.0000001, paintScale));
    ctx.strokeStyle = paintColor;
    ctx.globalCompositeOperation = (paintTool === 'eraser') ? 'destination-out' : 'source-over';
    // Рисуем отрезок last→p, чтобы штрих всегда был виден
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    paintLastRef.current = p;
    setPaintHasDraw(true);
    e.preventDefault();
  }
  function onPaintUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === 'touch') {
      paintPointersRef.current.delete(e.pointerId);
      if (paintPointersRef.current.size < 2) {
        paintPinchRef.current = null;
      }
    }
    paintDrawingRef.current = false;
    paintLastRef.current = null;
  }
  // Touch fallback (iOS/Telegram WebView) — явная поддержка жестов
  function onTouchStartCanvas(e: React.TouchEvent<HTMLCanvasElement>) {
    if (status !== 'idle') return;
    if (e.touches.length >= 2) {
      const a = e.touches[0], b = e.touches[1];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const cx = (a.clientX + b.clientX) / 2;
      const cy = (a.clientY + b.clientY) / 2;
      paintPinchRef.current = { startDist: Math.max(1, d), startScale: paintScale, startTx: paintTx, startTy: paintTy, startCx: cx, startCy: cy };
      paintDrawingRef.current = false;
      e.preventDefault();
      return;
    }
    // одиночное касание — рисование
    paintDrawingRef.current = true;
    const t = e.touches[0];
    const p = paintPointFromClient(t.clientX, t.clientY);
    paintLastRef.current = p;
    const ctx = paintCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = (paintTool === 'eraser') ? 'destination-out' : 'source-over';
    ctx.strokeStyle = paintColor;
    ctx.lineWidth = Math.max(0.5, paintWidth / Math.max(0.0000001, paintScale));
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    // Мини-точка для момента касания
    ctx.lineTo(p.x + 0.001, p.y + 0.001);
    ctx.stroke();
    e.preventDefault();
  }
  function onTouchMoveCanvas(e: React.TouchEvent<HTMLCanvasElement>) {
    if (e.touches.length >= 2 && paintPinchRef.current) {
      const a = e.touches[0], b = e.touches[1];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const cx = (a.clientX + b.clientX) / 2;
      const cy = (a.clientY + b.clientY) / 2;
      const ratioRaw = d / Math.max(1, paintPinchRef.current.startDist);
      const scaleEps = 0.02;
      const ratio = (Math.abs(ratioRaw - 1) < scaleEps) ? 1 : ratioRaw;
      const nextScale = Math.max(PAINT_MIN_SCALE, Math.min(PAINT_MAX_SCALE, paintPinchRef.current.startScale * ratio));
      setPaintScale(nextScale);
      const k = nextScale / Math.max(0.0000001, paintPinchRef.current.startScale);
      setPaintTx(cx - k * (paintPinchRef.current.startCx - paintPinchRef.current.startTx));
      setPaintTy(cy - k * (paintPinchRef.current.startCy - paintPinchRef.current.startTy));
      e.preventDefault();
      return;
    }
    if (!paintDrawingRef.current || e.touches.length === 0) return;
    const ctx = paintCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const t = e.touches[0];
    const p = paintPointFromClient(t.clientX, t.clientY);
    const last = paintLastRef.current || p;
    ctx.lineWidth = Math.max(0.5, paintWidth / Math.max(0.0000001, paintScale));
    ctx.strokeStyle = paintColor;
    ctx.globalCompositeOperation = (paintTool === 'eraser') ? 'destination-out' : 'source-over';
    // Рисуем отрезок last→p
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    paintLastRef.current = p;
    setPaintHasDraw(true);
    e.preventDefault();
  }
  function onTouchEndCanvas(e: React.TouchEvent<HTMLCanvasElement>) {
    if (e.touches.length < 2) {
      paintPinchRef.current = null;
    }
    if (e.touches.length === 0) {
      paintDrawingRef.current = false;
      paintLastRef.current = null;
    }
    e.preventDefault();
  }
  function getPaintingDataURL(): string {
    const canvas = paintCanvasRef.current;
    if (!canvas) return '';
    try { return canvas.toDataURL('image/png'); } catch { return ''; }
  }
  function clearPainting() {
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setPaintHasDraw(false);
  }
  useEffect(() => {
    if (task?.answer_type !== 'painting') return;
    const fx = () => resizePaintCanvas();
    fx();
    window.addEventListener('resize', fx);
    return () => window.removeEventListener('resize', fx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, viewKey]);

  // Сброс состояния position при смене вопроса и установка стартового порядка
  useEffect(() => {
    if (task?.answer_type !== 'position') return;
    const items = parsePositionItems(task.task_text || '');
    setPosOrder(items.map(it => it.id));
    setPosCorrectIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, viewKey]);

  useEffect(() => {
    if (task?.answer_type !== 'table_num_input') return;
    const cols = Math.max(1, computeTableColumnCount(task));
    setTableNums(Array.from({ length: cols }, () => ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, viewKey]);

  const onPaintWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (status !== 'idle') return;
    // Зум только с Alt (как просили); без Alt — игнорируем
    if (e.altKey) {
      const cx = e.clientX;
      const cy = e.clientY;
      e.preventDefault();
      const factor = Math.pow(1.001, -e.deltaY);
      setPaintScale(prev => {
        const next = Math.max(PAINT_MIN_SCALE, Math.min(PAINT_MAX_SCALE, prev * factor));
        const k = next / prev;
        setPaintTx(tx => cx - k * (cx - tx));
        setPaintTy(ty => cy - k * (cy - ty));
        return next;
      });
    }
  };
  // Удалённый запуск через Piston (C++, C#, Java и т.д.)
  const runRemote = useCallback(async (lang: 'cpp' | 'csharp' | 'java', source: string): Promise<string[]> => {
    const map: Record<typeof lang, { language: string; filename: string }> = {
      cpp: { language: 'cpp', filename: 'main.cpp' },
      csharp: { language: 'csharp', filename: 'Program.cs' },
      java: { language: 'java', filename: 'Main.java' },
    } as const;
    const meta = map[lang];
    try {
      const res = await fetch('https://emkc.org/api/v2/piston/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: meta.language,
          version: '*',
          files: [{ name: meta.filename, content: source }],
        }),
      });
      if (!res.ok) return [`Ошибка запуска (${lang}): ${res.status} ${res.statusText}`];
      const data = await res.json();
      const out: string[] = [];
      if (data?.compile?.stdout) out.push(String(data.compile.stdout));
      if (data?.compile?.stderr) out.push(String(data.compile.stderr));
      if (data?.run?.stdout) out.push(String(data.run.stdout));
      if (data?.run?.stderr) out.push(String(data.run.stderr));
      if (out.length === 0) out.push('Готово.');
      return out;
    } catch (e: any) {
      return [String(e?.message || e || 'Не удалось выполнить код удалённо')];
    }
  }, []);
  // Рендер текста c поддержкой **жирного** и *жирного*
  function renderWithBold(src: string): React.ReactNode[] {
    // Сначала обрабатываем двойные **...**, затем — одинарные *...* в «обычных» фрагментах
    const renderSingles = (s: string, keyPrefix: string): React.ReactNode[] => {
      const out: React.ReactNode[] = [];
      let i = 0;
      while (i < s.length) {
        const start = s.indexOf('*', i);
        if (start === -1) { out.push(<span key={`${keyPrefix}-t-${i}`}>{s.slice(i)}</span>); break; }
        // если это двойная звезда — пропускаем как текст
        if (s[start + 1] === '*') {
          out.push(<span key={`${keyPrefix}-t-${i}`}>{s.slice(i, start + 2)}</span>);
          i = start + 2;
          continue;
        }
        const end = s.indexOf('*', start + 1);
        if (end === -1) { out.push(<span key={`${keyPrefix}-t-${i}`}>{s.slice(i)}</span>); break; }
        // до *, жирный, после
        if (start > i) out.push(<span key={`${keyPrefix}-t-${i}`}>{s.slice(i, start)}</span>);
        const boldInner = s.slice(start + 1, end);
        out.push(<strong key={`${keyPrefix}-s-${start}`} className="font-extrabold">{boldInner}</strong>);
        i = end + 1;
      }
      return out;
    };
    const parts: React.ReactNode[] = [];
    const re = /\*\*([\s\S]+?)\*\*/g;
    let last = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (m.index > last) parts.push(...renderSingles(src.slice(last, m.index), `b-pre-${last}`));
      parts.push(<strong key={`b-strong-${m.index}`} className="font-extrabold">{m[1]}</strong>);
      last = m.index + m[0].length;
    }
    if (last < src.length) parts.push(...renderSingles(src.slice(last), `b-post-${last}`));
    return parts;
  }

  // Извлекаем (T) ... (T) из prompt
  function parsePromptT(src: string): { display: string; t: string | null } {
    if (!src) return { display: '', t: null };
    const re = /\(T\)([\s\S]*?)\(T\)/g;
    const chunks: string[] = [];
    let cleaned = src;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      chunks.push((m[1] || '').trim());
    }
    cleaned = cleaned.replace(re, '').trim();
    return { display: cleaned, t: chunks.length ? chunks.join('\n\n') : null };
  }

  // multiple_choice: варианты — пары "(n) ... (n)"
  function parseMcOptions(src: string): Array<{ id: number; text: string }> {
    const res: Array<{ id: number; text: string }> = [];
    if (!src) return res;
    const re = /\((\d+)\)([\s\S]*?)\(\1\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const id = Number(m[1]);
      if (!Number.isFinite(id)) continue;
      const text = String(m[2] || '').trim();
      res.push({ id, text });
    }
    // Убираем дубликаты по id, сохраняя первый
    const seen = new Set<number>();
    return res.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; }).sort((a, b) => a.id - b.id);
  }

  function parseCorrectIds(src: string): Set<number> {
    const re = /\((\d+)\)/g;
    const s = new Set<number>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(src || ''))) {
      const n = Number(m[1]); if (Number.isFinite(n)) s.add(n);
    }
    return s;
  }

  // position: извлекаем элементы в исходном порядке появления (без сортировки по id)
  function parsePositionItems(src: string): Array<{ id: number; text: string }> {
    const res: Array<{ id: number; text: string }> = [];
    if (!src) return res;
    const re = /\((\d+)\)([\s\S]*?)\(\1\)/g;
    const seen = new Set<number>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const id = Number(m[1]);
      if (!Number.isFinite(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      const text = String(m[2] || '').trim();
      res.push({ id, text });
    }
    return res;
  }

  function partsWithMarkers(src: string): Array<{ t: 'text' | 'blank' | 'letterbox' | 'inputbox' | 'cardbox'; v?: string }>{
    const res: Array<{ t: 'text' | 'blank' | 'letterbox' | 'inputbox' | 'cardbox'; v?: string }> = [];
    const re = /(\(underline\)|\(letter_box\)|\(input_box\)|\(card_box\))/g;
    let last = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(src))){
      if (m.index > last) res.push({ t: 'text', v: src.slice(last, m.index) });
      const token = m[0];
      if (token === '(underline)') res.push({ t: 'blank' });
      else if (token === '(letter_box)') res.push({ t: 'letterbox' });
      else if (token === '(input_box)') res.push({ t: 'inputbox' });
      else if (token === '(card_box)') res.push({ t: 'cardbox' });
      last = m.index + m[0].length;
    }
    if (last < src.length) res.push({ t: 'text', v: src.slice(last) });
    return res;
  }

  // Перенос нумерованных пунктов "1) ... 2) ..." на новую строку
  function ensureNumberedNewlines(src: string): string {
    if (!src) return '';
    // Если перед n) нет переноса строки, но есть пробел — ставим перенос
    // Пример: "Текст 1) пункт 1  2) пункт 2" -> "Текст\n1) пункт 1\n2) пункт 2"
    return src.replace(/([^\n])\s+(\d+\))/g, (_m, prev: string, num: string) => `${prev}\n${num}`);
  }

  // Рендер многострочного текста с сохранением переносов и жирного по *звёздочкам*
  function renderTextLines(src: string, keyPrefix: string): React.ReactNode[] {
    const prepared = ensureNumberedNewlines(src);
    const lines = prepared.split(/\n+/);
    const out: React.ReactNode[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().length === 0) {
        out.push(<br key={`${keyPrefix}-br-${i}`} />);
      } else {
        out.push(
          <div key={`${keyPrefix}-ln-${i}`} className="">
            {renderWithBold(line)}
          </div>
        );
      }
    }
    return out;
  }

  // Нормализация ответа: убираем лишние пробелы и понижаем регистр (ru)
  function normalizeAnswer(src: string): string {
    try {
      return String(src || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('ru');
    } catch {
      return String(src || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }
  }

  // Нормализуем десятичное число: допускаем "1,5" и "1.5", пробелы, знак
  // Возвращает каноничную строку числа или null, если строка не является числом
  function normalizeDecimalString(src: string): string | null {
    const raw = String(src || '').trim();
    if (!raw) return null;
    const compact = raw.replace(/\s+/g, '');
    // Заменяем запятую на точку; допускаем один десятичный разделитель
    const unified = compact.replace(/,/g, '.');
    if (!/^[-+]?\d+(?:\.\d+)?$/.test(unified)) return null;
    const num = Number(unified);
    if (!Number.isFinite(num)) return null;
    return String(num);
  }

  function decimalEquals(a: string, b: string): boolean {
    const na = normalizeDecimalString(a);
    const nb = normalizeDecimalString(b);
    return na != null && nb != null && na === nb;
  }

  // Разбор корректных ответов: поддержка списка через запятую
  function parseAnswerList(src: string): string[] {
    const s = String(src || '').trim();
    if (!s) return [];
    // если приходит JSON-массив — попробуем распарсить
    if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('"') && s.endsWith('"'))) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) return arr.map((x) => String(x || ''));
      } catch {}
    }
    // по умолчанию — разделитель запятая
    return s.split(',').map((x) => x.trim()).filter(Boolean);
  }

  // Разбор вариантов для num_input через |
  function parseAnswerPipe(src: string): string[] {
    const s = String(src || '').trim();
    if (!s) return [];
    return s.split('|').map((x) => x.trim()).filter(Boolean);
  }

  function computeTableColumnCount(tableTask?: TaskRow): number {
    if (!tableTask) return 0;
    const variants = parseAnswerPipe(tableTask.correct || '');
    const templateRaw = (variants[0] ?? tableTask.correct ?? '') || '';
    const template = String(templateRaw);
    const digitsOnly = template.replace(/[^0-9]/g, '');
    if (digitsOnly.length > 0) return digitsOnly.length;
    const compact = template.replace(/\s+/g, '');
    if (compact.length > 0) return compact.length;
    if (Array.isArray(tableTask.options) && tableTask.options.length > 0) return tableTask.options.length;
    return Math.max(1, String(tableTask.correct || '').length || 1);
  }

  function tableLetterLabel(idx: number): string {
    const base = 26;
    let n = idx;
    let label = '';
    while (n >= 0) {
      label = String.fromCharCode(65 + (n % base)) + label;
      n = Math.floor(n / base) - 1;
    }
    return label;
  }

  // Извлекаем CSV-таблицы из блоков (table) ... (table)
  function extractCsvTables(src: string): Array<string[][]> {
    const s = String(src || '');
    if (!s) return [];
    const re = /\(table\)([\s\S]*?)\(table\)/g;
    const tables: Array<string[][]> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const inner = String(m[1] || '');
      const lines = inner.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length === 0) continue;
      const rows = lines.map(line => line.split(',').map(cell => cell.trim()));
      tables.push(rows);
    }
    return tables;
  }

  // Разбиваем task_text на чередующиеся сегменты текста и таблиц
  function splitTextAndTables(src: string): Array<{ kind: 'text'; text: string } | { kind: 'table'; rows: string[][] }> {
    const s = String(src || '');
    if (!s) return [];
    const re = /\(table\)([\s\S]*?)\(table\)/g;
    const out: Array<{ kind: 'text'; text: string } | { kind: 'table'; rows: string[][] }> = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      if (m.index > last) {
        const textChunk = s.slice(last, m.index);
        if (textChunk.trim().length > 0) out.push({ kind: 'text', text: textChunk });
      }
      const inner = String(m[1] || '');
      const lines = inner.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      const rows = lines.map(line => line.split(',').map(cell => cell.trim()));
      out.push({ kind: 'table', rows });
      last = m.index + m[0].length;
    }
    if (last < s.length) {
      const tail = s.slice(last);
      if (tail.trim().length > 0) out.push({ kind: 'text', text: tail });
    }
    return out;
  }

  const canAnswer = useMemo(() => {
    if (!task) return false;
    if (task.answer_type === 'choice') return !!choice;
    if (task.answer_type === 'multiple_choice') return (multiSel.length > 0);
    if (task.answer_type === 'word_letters') return (lettersSel.length > 0);
    if (task.answer_type === 'cards') return (selectedCard != null);
    if (task.answer_type === 'text') return text.trim().length > 0;
    if (task.answer_type === 'input') return text.trim().length > 0;
    if (task.answer_type === 'num_input' || task.answer_type === 'listening') return text.trim().length > 0;
    if (task.answer_type === 'table_num_input') return tableNums.length > 0 && tableNums.every((v) => v.trim().length === 1);
    if (task.answer_type === 'it_code') return text.trim().length > 0;
    if (task.answer_type === 'it_code_2') return (itc2Top.trim().length > 0 && itc2Bottom.trim().length > 0);
    if (task.answer_type === 'painting') return text.trim().length > 0;
    if (task.answer_type === 'connections') {
      const left = parseMcOptions(task.task_text || '');
      if (left.length === 0) return false;
      if (!connMap || connMap.length === 0) return false;
      // Достаточно подключить хотя бы одну связь
      return connMap.some((v) => Number.isFinite(v) && (v as any) > 0);
    }
    if (task.answer_type === 'position') {
      return parsePositionItems(task.task_text || '').length > 0;
    }
    return false;
}, [task, choice, text, lettersSel, selectedCard, multiSel, connMap, itc2Top, itc2Bottom, paintHasDraw, tableNums]);

  // Раскладка «клавиатуры»: распределяем элементы по строкам красиво
  function computeRows(count: number): number[] {
    const n = Math.max(0, count | 0);
    if (n <= 4) return [n];                 // 1 ряд, если <=4
    if (n <= 8) {                            // 2 ряда ~поровну, 5 → 3+2, 6 → 3+3, 7 → 4+3, 8 → 4+4
      const a = Math.ceil(n / 2);
      const b = n - a;
      return [a, b];
    }
    // 3 ряда как можно ровнее: 9→3+3+3, 10→4+3+3, 11→4+4+3, 12→4+4+4, ...
    const base = Math.floor(n / 3);
    const rem = n % 3; // 0..2
    return [base + (rem > 0 ? 1 : 0), base + (rem > 1 ? 1 : 0), base];
  }

  async function check(){
    if (!task) return;
    let user = '';
    if (task.answer_type === 'text' || task.answer_type === 'input' || task.answer_type === 'it_code') user = text.trim();
    else if (task.answer_type === 'num_input' || task.answer_type === 'listening') user = text.trim();
    else if (task.answer_type === 'table_num_input') user = tableNums.map((v) => v.trim()).join('');
    else if (task.answer_type === 'choice') user = (choice || '');
    else if (task.answer_type === 'multiple_choice') {
      // сравнение множеств как строк отсортированных id
      const sel = Array.from(new Set(multiSel)).sort((a, b) => a - b);
      const correct = Array.from(parseCorrectIds(task.correct || '')).sort((a, b) => a - b);
      user = sel.join(','); // для логов
      const ok = sel.length === correct.length && sel.every((v, i) => v === correct[i]);
      handleAnswerResult(ok);
      return;
    }
    else if (task.answer_type === 'word_letters') {
      const opts = (task.options || []) as string[];
      user = lettersSel.map(i => opts[i] ?? '').join('');
    } else if (task.answer_type === 'cards') {
      const opts = (task.options || []) as string[];
      user = (selectedCard != null) ? (opts[selectedCard] ?? '') : '';
  } else if (task.answer_type === 'connections') {
    const left = parseMcOptions(task.task_text || '');
    const mapSafe = connMap.slice(0, left.length).map(v => Math.max(0, Number(v) || 0));
    user = mapSafe.join('');
  } else if (task.answer_type === 'painting') {
      user = text.trim();
  } else if (task.answer_type === 'position') {
      // строка из цифр по текущему порядку
      user = posOrder.join('');
  }
    // Проверка правильности
    let ok = false;
    if (task.answer_type === 'text' || task.answer_type === 'input' || task.answer_type === 'it_code' || task.answer_type === 'painting') {
      const userNorm = normalizeAnswer(user);
      // Для input не используем список через запятую, чтобы не ломать десятичные числа вида "1,5"
      let variants = (task.answer_type === 'input') ? [] : parseAnswerList(task.correct || '');
      // Для it_code и input поддерживаем разделитель "|"
      if (task.answer_type === 'it_code' || task.answer_type === 'input') {
        const pipe = parseAnswerPipe(task.correct || '');
        if (pipe.length > 0) {
          const set = new Set<string>(variants.map(v => v));
          for (const p of pipe) if (!set.has(p)) variants.push(p);
        }
      }
      if (variants.length > 0) {
        ok = variants.some((v) => {
          if (task.answer_type === 'input' && decimalEquals(v, user)) return true;
          return normalizeAnswer(v) === userNorm;
        });
      } else {
        ok = (userNorm === normalizeAnswer(task.correct || '')) || (task.answer_type === 'input' && decimalEquals(task.correct || '', user));
      }
  } else if (task.answer_type === 'num_input' || task.answer_type === 'listening') {
    const variants = parseAnswerPipe(task.correct || '');
    if (variants.length > 0) {
      ok = variants.some((v) => decimalEquals(String(v), user));
    } else {
      ok = decimalEquals(String(task.correct || ''), user);
    }
  } else if (task.answer_type === 'table_num_input') {
    const sanitizedUser = user.replace(/\s+/g, '');
    const matches = (sample: string) => {
      const digits = String(sample || '').replace(/\s+/g, '').replace(/[^0-9]/g, '');
      return digits === sanitizedUser;
    };
    const variants = parseAnswerPipe(task.correct || '');
    if (variants.length > 0) {
      ok = variants.some(matches);
    } else {
      ok = matches(task.correct || '');
    }
    } else if (task.answer_type === 'it_code_2') {
      const san = (s: string) => String(s || '').trim().replace(/[^\d]+/g, '');
      const parts = String(task.correct || '').split('&');
      const expTop = san(parts[0] || '');
      const expBot = san(parts[1] || '');
      const userTop = san(itc2Top);
      const userBot = san(itc2Bottom);
      ok = (userTop === expTop) && (userBot === expBot);
    } else if (task.answer_type === 'position') {
      const items = parsePositionItems(task.task_text || '');
      const exp = parseCorrectDigits(task.correct || '', items.length);
      const userArr = posOrder.slice(0, items.length);
      // Подсветка: какие id стояли на «своём» месте до проверки
      const correctSet = new Set<number>();
      for (let i = 0; i < items.length; i++) {
        if ((userArr[i] || 0) === (exp[i] || 0)) correctSet.add(userArr[i] || 0);
      }
      setPosCorrectIds(correctSet);
      ok = (userArr.length === exp.length) && userArr.every((v, i) => v === exp[i]);
      // Если неверно — переставим элементы в правильный порядок
      if (!ok) {
        setPosOrder(exp.slice(0, items.length));
      }
    } else {
      ok = user === (task.correct || '');
    }
    setStatus(ok ? 'correct' : 'wrong');
    try { ok ? hapticSuccess() : hapticError(); } catch {}
    try { ok ? sfx.playCorrect() : sfx.playWrong(); } catch {}
    // обновим метрики
    setAnswersTotal((v) => v + 1);
    if (ok) setAnswersCorrect((v) => v + 1); else setHadAnyMistakes(true);

    // Режим повторов: стрик не считаем, управляем очередью
    if (mode === 'repeat') {
      setStreakLocal(0); setStreakFlash(null);
      // Не меняем очередь до нажатия «Продолжить», чтобы не прыгал вопрос
      lastRepeatOkRef.current = ok;
      if (ok) {
        try {
          const id = (task as any)?.id;
          if (!solvedRef.current.has(id)) {
            solvedRef.current.add(id);
            setProgressCount((p) => Math.min(PLANNED_COUNT, p + 1));
          }
        } catch {}
      }
      return;
    }

    // Базовая фаза: считаем стрик и копим ошибки в очередь
    if (ok) {
      setStreakLocal((prev) => {
        const next = prev + 1;
        if (next >= 2) {
          streakKeyRef.current += 1;
          setStreakFlash({ v: next, key: streakKeyRef.current });
          if (next === 5 || next === 10) {
            void streakCtrl.start({ scale: [1, 2.2, 0.9, 1], rotate: [0, -22, 14, 0], y: [-2, -16, -8, -2] }, { type: 'tween', ease: 'easeInOut', duration: 1.05 });
          } else {
            void streakCtrl.start({ scale: 1, rotate: 0, y: 0 }, { duration: 0.2 });
          }
        }
        if (next === 5 || next === 10) {
          try { hapticStreakMilestone(); } catch {}
          const bonus: 2 | 5 = next === 5 ? 2 : 5;
          rewardKeyRef.current += 1;
          setRewardBonus(bonus);
          setEnergy((prevE) => {
            const n = Math.max(0, Math.min(25, (prevE || 0) + bonus));
            try { const cs = cacheGet<any>(CACHE_KEYS.stats) || {}; cacheSet(CACHE_KEYS.stats, { ...cs, energy: n }); window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { energy: n } } as any)); } catch {}
            return n;
          });
          (async () => { try { const res = await rewardEnergy(bonus); const serverEnergy = res?.energy; if (typeof serverEnergy === 'number') { const clamped = Math.max(0, Math.min(25, Number(serverEnergy))); setEnergy((prevE) => Math.max(prevE || 0, clamped)); } } catch {} })();
        }
        return next;
      });
      try { const id = (task as any)?.id; if (!solvedRef.current.has(id)) { solvedRef.current.add(id); setProgressCount((p) => Math.min(PLANNED_COUNT, p + 1)); } } catch {}
    } else {
      setStreakLocal(0); setStreakFlash(null);
      setRepeatQueue((prev) => { const exists = prev.some((t) => String((t as any)?.id) === String((task as any)?.id)); return exists ? prev : [...prev, task]; });
    }
  }

  function handleAnswerResult(ok: boolean) {
    if (!task) return;
    setStatus(ok ? 'correct' : 'wrong');
    try { ok ? hapticSuccess() : hapticError(); } catch {}
    try { ok ? sfx.playCorrect() : sfx.playWrong(); } catch {}
    setAnswersTotal((v) => v + 1);
    if (ok) setAnswersCorrect((v) => v + 1); else setHadAnyMistakes(true);
    if (mode === 'repeat') {
      setStreakLocal(0); setStreakFlash(null);
      lastRepeatOkRef.current = ok;
      if (ok) {
        try {
          const id = (task as any)?.id;
          if (!solvedRef.current.has(id)) {
            solvedRef.current.add(id);
            setProgressCount((p) => Math.min(PLANNED_COUNT, p + 1));
          }
        } catch {}
      }
      return;
    }
    if (ok) {
      setStreakLocal((prev) => {
        const next = prev + 1;
        if (next >= 2) {
          streakKeyRef.current += 1;
          setStreakFlash({ v: next, key: streakKeyRef.current });
          if (next === 5 || next === 10) {
            void streakCtrl.start({ scale: [1, 2.2, 0.9, 1], rotate: [0, -22, 14, 0], y: [-2, -16, -8, -2] }, { type: 'tween', ease: 'easeInOut', duration: 1.05 });
          } else {
            void streakCtrl.start({ scale: 1, rotate: 0, y: 0 }, { duration: 0.2 });
          }
        }
        if (next === 5 || next === 10) {
          try { hapticStreakMilestone(); } catch {}
          const bonus: 2 | 5 = next === 5 ? 2 : 5;
          rewardKeyRef.current += 1;
          setRewardBonus(bonus);
          setEnergy((prevE) => {
            const n = Math.max(0, Math.min(25, (prevE || 0) + bonus));
            try { const cs = cacheGet<any>(CACHE_KEYS.stats) || {}; cacheSet(CACHE_KEYS.stats, { ...cs, energy: n }); window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { energy: n } } as any)); } catch {}
            return n;
          });
          (async () => {
            try {
              const res = await rewardEnergy(bonus);
              const serverEnergy = res?.energy;
              if (typeof serverEnergy === 'number') {
                const clamped = Math.max(0, Math.min(25, Number(serverEnergy)));
                setEnergy((prevE) => Math.max(prevE || 0, clamped));
              }
            } catch {}
          })();
        }
        return next;
      });
      try {
        const id = (task as any)?.id;
        if (!solvedRef.current.has(id)) {
          solvedRef.current.add(id);
          setProgressCount((p) => Math.min(PLANNED_COUNT, p + 1));
        }
      } catch {}
    } else {
      setStreakLocal(0); setStreakFlash(null);
      setRepeatQueue((prev) => {
        const exists = prev.some((t) => String((t as any)?.id) === String((task as any)?.id));
        return exists ? prev : [...prev, task];
      });
    }
  }

  function next(){
    if (mode === 'base') {
      if (baseIdx + 1 < planned.length) {
        setBaseIdx(baseIdx + 1);
      } else {
        if (repeatQueue.length > 0) { setMode('repeat'); setRepeatCurrent(repeatQueue[0] || null); } else { setStreakLocal(0); setStreakFlash(null); setShowFinish(true); setFinishMs(Date.now() - lessonStartedAt); return; }
      }
    } else {
      // Применяем результат последнего ответа к очереди
      const ok = lastRepeatOkRef.current === true;
      lastRepeatOkRef.current = null;
      setRepeatQueue((prev) => {
        if (prev.length === 0) return prev;
        const next = ok ? prev.slice(1) : [...prev.slice(1), prev[0]];
        // Обновим текущий вопрос синхронно
        setRepeatCurrent(next[0] || null);
        return next;
      });
      // Если после применения очередь пуста — завершаем
      if ((repeatQueue.length === 0) || (ok && repeatQueue.length === 1)) {
        // после setRepeatQueue next будет пуст — закроем на следующем кадре
        setTimeout(() => { if ((repeatQueue.length === 0) || (ok && repeatQueue.length === 1)) { setStreakLocal(0); setStreakFlash(null); setShowFinish(true); setFinishMs(Date.now() - lessonStartedAt); } }, 0);
        // продолжаем reset стейтов ниже
      }
    }
    setChoice(null);
    setText('');
    setItc2Top('');
    setItc2Bottom('');
    setLettersSel([]);
    setSelectedCard(null);
    setMultiSel([]);
    setConnActiveTask(null);
    setConnMap([]);
    setConnLines([]);
    setPosOrder([]);
    setPosCorrectIds(new Set());
    setStatus('idle');
    setStreakFlash(null);
    setShowT(false);
    // Сброс редактора кода для нового вопроса
    setCodeLang('python');
    setCodeBy({ python: '', cpp: '', csharp: '', java: '' });
    setCodeOut([]);
    setCodeRunning(false);
    // Сброс рисовалки
    clearPainting();
    setPaintTool('pen');
    setPaintColor('#ffffff');
    setPaintWidth(4);
    setPaintScale(1);
    setPaintTx(0);
    setPaintTy(0);
    paintInitRef.current = false;
    setTableNums([]);
    setViewKey((k) => k + 1);
  }

  // Когда показываем экран завершения — сразу фиксируем стрик (гарантированно один раз)
  useEffect(() => {
    if (showFinish && !finishSavedRef.current) {
      finishSavedRef.current = true;
      // Передадим признак идеального урока через глобал (не ломая сигнатуры)
      try { (window as any).__exampliLessonPerfect = !hadAnyMistakes; } catch {}
      try { (window as any).__exampliLessonMs = Math.max(0, Number(Date.now() - lessonStartedAt)); } catch {}
      (async () => {
        try { await finishLesson({ correct: true, elapsedMs: Math.max(0, Number(Date.now() - lessonStartedAt)), lessonId }); } catch {}
        finally { try { (window as any).__exampliLessonPerfect = undefined; (window as any).__exampliLessonMs = undefined; } catch {} }
      })();
    }
  }, [showFinish, hadAnyMistakes]);

  function onContinue(){
    try { hapticTiny(); } catch {}
    // Подписчики: энергия не тратится — просто продолжаем
    if (isPlus) {
      next();
      return;
    }
    // Остальные: мгновенно уменьшаем энергию и иконку
    setEnergy(prev => {
      const nextVal = Math.max(0, Math.min(25, (prev || 0) - 1));
      try {
        const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
        cacheSet(CACHE_KEYS.stats, { ...cs, energy: nextVal });
        try { window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { energy: nextVal } } as any)); } catch {}
        // фоновое обновление на сервере (RPC с ленивой регенерацией)
        (async () => { try { await spendEnergy(); } catch {} })();
      } catch {}
      if (nextVal <= 0) { setStreakLocal(0); setStreakFlash(null); onClose(); return nextVal; }
      next();
      return nextVal;
    });
  }

  // Telegram BackButton: показать и перехватить для подтверждения выхода
  useEffect(() => {
    if (!open) return;
    try {
      const tg = (window as any)?.Telegram?.WebApp;
      tg?.BackButton?.show?.();
      const handler = () => { try { hapticTiny(); } catch {} setConfirmExit(true); };
      tg?.BackButton?.onClick?.(handler);
      return () => { try { tg?.BackButton?.offClick?.(handler); tg?.BackButton?.hide?.(); } catch {} };
    } catch {}
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* запрет закрытия по клику вне панели */}
          <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            className="sheet-panel full"
            role="dialog"
            aria-modal="true"
            style={{ top: 'var(--hud-top)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* верхняя панель: прогресс (сузили) + батарейка справа; скрыть во время загрузки */}
            {!loading && !showFinish && (
              <div className="px-5 pt-2 pb-2 border-b border-white/10 relative" ref={headerRef}>
                {/* Левая/правая части шапки */}
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 flex items-center justify-start">
                    {mode === 'repeat' && repeatQueue.length > 0 && (
                      <img src="/lessons/repeat.svg" alt="" aria-hidden className="w-8 h-8" />
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isPlus ? (
                      <img src="/stickers/battery/plus.svg" alt="" aria-hidden className="w-14 h-14" />
                    ) : (
                      <>
                        <img src={`/stickers/battery/${Math.max(0, Math.min(25, energy))}.svg`} alt="" aria-hidden className="w-6 h-6" />
                        <span className={[
                          'tabular-nums font-bold text-base',
                          energy <= 0 ? 'text-gray-400' : (energy <= 5 ? 'text-red-400' : 'text-green-400')
                        ].join(' ')}>{energy}</span>
                      </>
                    )}
                  </div>
                </div>
                {/* Центрированный прогресс поверх шапки */}
                <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center w-full">
                  <div className="progress w-[64%] max-w-[400px] -ml-6" ref={progressRef}>
                    <div style={{ width: `${Math.round(((progressCount) / Math.max(1, planned.length || 1)) * 100)}%`, background: (streakLocal >= 10 ? '#123ba3' : (streakLocal >= 5 ? '#2c58c7' : '#3c73ff')) }} />
                  </div>
                </div>
                {/* streak flash */}
                <AnimatePresence>
                  {streakFlash && mode !== 'repeat' && (
                    <motion.div
                      key={`streak-${streakFlash.key}`}
                      initial={{ opacity: 0, y: -8, scale: 0.96, rotate: 0 }}
                      animate={{ opacity: 1, y: 6, scale: 1.0, rotate: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="absolute top-[-7px] font-extrabold text-xs"
                      style={{ color: ((streakFlash?.v ?? 0) >= 10 ? '#123ba3' : ((streakFlash?.v ?? 0) >= 5 ? '#2c58c7' : '#3c73ff')), left: streakLeft }}
                    >
                      <motion.span initial={{ scale: 1, rotate: 0, y: 0 }} animate={streakCtrl}>
                        {streakFlash.v} ПОДРЯД
                      </motion.span>
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* Текст для повторов убран — только иконка слева от прогресса */}
                {/* reward overlay +2/+5 — по центру экрана */}
                <AnimatePresence>
                  {rewardBonus > 0 && (
                    <motion.div
                      key={`reward-${rewardKeyRef.current}`}
                      className="fixed inset-0 flex items-center justify-center pointer-events-none"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      style={{ zIndex: 1000 }}
                    >
                      <motion.div
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: [0.4, 1.6, 1.0], opacity: [0, 1, 1, 0] }}
                        transition={{ duration: 1.1, times: [0, 0.32, 0.8, 1] }}
                        onAnimationComplete={() => { setRewardBonus(0); }}
                        className="font-extrabold"
                        style={{ fontSize: 'min(22vw, 160px)', color: (rewardBonus === 5 ? '#123ba3' : '#2c58c7'), textShadow: '0 8px 0 rgba(0,0,0,0.18)' }}
                      >
                        +{rewardBonus}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div className="p-4 flex flex-col gap-4 pb-[calc(env(safe-area-inset-bottom)+180px)] min-h-[78vh]">
              {loading ? (
                <div className="flex flex-col items-center justify-center w-full min-h-[70vh]">
                  <img src="/lessons/loading_lesson.svg" alt="" className="w-full h-auto" />
                  <div className="mt-6 w-8 h-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
                </div>
              ) : showFinish ? (
                <FinishOverlay
                  answersTotal={answersTotal}
                  answersCorrect={answersCorrect}
                  hadAnyMistakes={hadAnyMistakes}
                  elapsedMs={finishMs}
                  onDone={() => {
                    setShowFinish(false);
                    const beforeSnap = beforeRef.current;
                    try { onClose(); } catch {}
                    try { navigate('/post-lesson', { state: { before: beforeSnap } }); } catch {}
                  }}
                  onReady={() => setFinishReady(true)}
                  canProceed={finishReady}
                />
              ) : task ? (
                <>
                  {task.answer_type !== 'it_code' && (() => {
                    const { display, t } = parsePromptT(task.prompt || '');
                    return (
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm text-muted flex-1">
                          {renderWithBold(display)}
                        </div>
                        {t && (
                          <div className="shrink-0">
                            <PressOption
                              active={false}
                              onClick={() => { try { hapticSelect(); } catch {} setShowT(true); }}
                              disabled={false}
                              resolved={null}
                              size="sm"
                              fullWidth={false}
                              variant="black"
                            >
                              ТЕКСТ
                            </PressOption>
                          </div>
                        )}
                        {/* Оверлей для (T) */}
                        {showT && t && (
                          <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                            <div className="absolute inset-0 bg-black/95" onClick={() => setShowT(false)} />
                            <div className="relative z-[10000] max-w-[620px] w-full px-3 py-4">
                              <div className="rounded-2xl border border-white/10 bg-black">
                                <div className="flex items-start justify-between p-3 border-b border-white/10">
                                  <div className="font-extrabold text-white text-sm">ТЕКСТ</div>
                                  <button
                                    type="button"
                                    className="text-white/70 hover:text-white text-xl leading-none px-2"
                                    onClick={() => setShowT(false)}
                                    aria-label="Закрыть"
                                  >
                                    ×
                                  </button>
                                </div>
                                <div className="p-3 max-h-[60vh] overflow-y-auto">
                                  <div className="text-white whitespace-pre-wrap leading-relaxed">
                                    {renderWithBold(t)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div className="relative overflow-hidden">
                    <AnimatePresence initial={false} mode="wait">
                      <motion.div
                        key={`task-${viewKey}`}
                        initial={{ x: '20%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '-20%', opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className={`card text-left`}
                      >
                        <div className="text-lg leading-relaxed">
                          {(task.answer_type === 'it_code' || task.answer_type === 'it_code_2') ? (
                            <div className="space-y-3">
                              {(() => {
                                const segs = splitTextAndTables(task.task_text || '');
                                if (segs.length === 0) return renderTextLines(task.task_text || '', 'itc-empty');
                                return segs.map((seg, i) => {
                                  if (seg.kind === 'text') {
                                    return (
                                      <div key={`itc-t-${i}`} className="">
                                        {renderTextLines(seg.text, `itc-t-${i}`)}
                                      </div>
                                    );
                                  }
                                  return <ItCodeTable key={`itc-tab-${i}`} rows={seg.rows} status={status} kind="task" />;
                                });
                              })()}
                              {status !== 'idle' && (() => {
                                const corrTables = extractCsvTables(task.correct || '');
                                if (corrTables.length > 0) {
                                  return corrTables.map((rows, ci) => (
                                    <ItCodeTable key={`itc-c-${ci}`} rows={rows} status={status} kind="correct" />
                                  ));
                                }
                                return null;
                              })()}
                            </div>
                          ) : ((task.answer_type === 'multiple_choice' || task.answer_type === 'connections') ? null : partsWithMarkers(task.task_text).map((p, i) => {
                        // для position не показываем task_text как текст — элементы будут ниже как список
                        if (task.answer_type === 'position') return null;
                        if (p.t === 'text') return renderTextLines(p.v || '', `t-${i}`);
                        if (p.t === 'blank') {
                          return (status === 'idle')
                            ? <span key={i} className="px-1 font-semibold">____</span>
                            : <span key={i} className={`px-1 font-extrabold ${status === 'correct' ? 'text-green-400' : 'text-red-400'}`}>{task.correct}</span>;
                        }
                        // letter box
                        const selectedWord = (task.options || []) && lettersSel.length
                          ? lettersSel.map(j => (task.options as string[])[j] || '').join('')
                          : '';
                        if (p.t === 'letterbox') {
                          return (
                            <LetterBox
                              key={`lb-${i}`}
                              value={status === 'idle' ? selectedWord : (task.correct || '')}
                              editable={status === 'idle' && task.answer_type === 'word_letters'}
                              lettersSel={lettersSel}
                              options={(task.options || []) as string[]}
                              onRemove={(pos) => {
                                setLettersSel(prev => prev.filter((_, k) => k !== pos));
                              }}
                              status={status}
                            />
                          );
                        }
                        // input box for text answer
                        if (p.t === 'inputbox') return (
                          <InputBox
                            key={`ib-${i}`}
                            value={status === 'idle' ? text : (task.correct || '')}
                            editable={status === 'idle' && task.answer_type === 'text'}
                            onChange={(val) => setText(val)}
                            status={status}
                          />
                        );
                        // card box marker
                        if (p.t === 'cardbox') {
                          const chosen = (selectedCard != null) ? (((task.options || [])[selectedCard] as string) || '') : '';
                          const txt = (status !== 'idle') ? (task.correct || '') : chosen;
                          if (selectedCard != null) {
                            const stateClass = (status === 'idle')
                              ? 'bg-white/10 border-white/15 text-white'
                              : (status === 'correct'
                                  ? 'text-green-400 bg-green-600/10 border-green-500/60'
                                  : 'text-red-400 bg-red-600/10 border-red-500/60');
                            return (
                              <button
                                key={`cb-sel-${i}`}
                                type="button"
                                onClick={() => { if (status === 'idle') { try { hapticTiny(); } catch {} setSelectedCard(null); } }}
                                disabled={status !== 'idle'}
                                className={`rounded-lg px-2 py-1 text-sm font-semibold border ${stateClass} ${status !== 'idle' ? 'opacity-60 cursor-not-allowed' : ''}`}
                              >
                                {txt}
                              </button>
                            );
                          }
                          return (
                            <CardBox
                              key={`cb-${i}`}
                              cardText={status !== 'idle' ? (task.correct || '') : ''}
                              onRemove={() => setSelectedCard(null)}
                              setRect={(r) => setCardBoxRect(r)}
                              status={status}
                            />
                          );
                        }
                        return null;
                        }))}
                        {task.answer_type === 'listening' && (
                        <div className="mt-4 px-1">
                          <audio
                            ref={audioRef}
                            src={listeningMeta?.src || undefined}
                            preload="auto"
                            className="hidden"
                            autoPlay={false}
                          />
                            {listeningMeta?.src ? (
                              <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#101833] via-[#111c3f] to-[#08162b] p-4 shadow-[0px_20px_35px_rgba(0,0,0,0.45)]">
                                <div className="flex items-center gap-4">
                                  <button
                                    type="button"
                                    onClick={handleListeningToggle}
                                    disabled={status !== 'idle' || listeningEnded || !listeningMeta?.src}
                                    className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold transition-all duration-150 ${
                                      (status !== 'idle' || listeningEnded || !listeningMeta?.src)
                                        ? 'opacity-60 cursor-not-allowed bg-white/10 text-white/40'
                                        : 'bg-white text-[#101833] shadow-[0px_12px_28px_rgba(16,24,51,0.45)]'
                                    }`}
                                    aria-label={listeningPlaying ? 'Пауза' : 'Воспроизвести'}
                                  >
                                    {listeningPlaying ? '❚❚' : '▶'}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between text-[12px] text-white/70 font-semibold">
                                      <span className="truncate">Тема {listeningMeta.topicOrder}, урок {listeningMeta.lessonOrder}</span>
                                      <span className="tabular-nums text-white/80">
                                        {formatTime(listeningProgress)} / {(listeningReady || listeningEnded) ? formatTime(listeningDuration) : '--:--'}
                                      </span>
                                    </div>
                                    <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all duration-200"
                                        style={{
                                          width: `${listeningProgressPct}%`,
                                          background: 'linear-gradient(90deg, #60efff 0%, #5b8bff 50%, #d889ff 100%)'
                                        }}
                                      />
                                    </div>
                                    {listeningEnded && (
                                      <div className="mt-2 text-xs text-amber-200 font-semibold">
                                        Прослушивание завершено. Повтор недоступен.
                                      </div>
                                    )}
                                    {listeningError && (
                                      <div className="mt-2 text-xs text-red-200 font-semibold">
                                        {listeningError}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 text-amber-100 text-sm font-semibold px-4 py-3">
                                Аудиотрек для этого задания появится позже.
                              </div>
                            )}
                          </div>
                        )}
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* ответы */}
                  {(task.answer_type === 'choice') && (
                    <div className="grid gap-2 mt-auto mb-16">
                      {(task.options || []).map((opt) => {
                        const active = choice === opt;
                        return (
                          <PressOption key={opt} active={active} onClick={() => { setChoice(opt); }} disabled={status !== 'idle'}>
                            {opt}
                          </PressOption>
                        );
                      })}
                    </div>
                  )}

                  {(task.answer_type === 'multiple_choice') && (
                    <div className="grid gap-2 mt-auto mb-16">
                      {(() => {
                        const opts = parseMcOptions(task.task_text || '');
                        const correct = parseCorrectIds(task.correct || '');
                        const selectedSet = new Set<number>(multiSel);
                        return opts.map(({ id, text }) => {
                          const isSelected = selectedSet.has(id);
                          let resolved: 'green' | 'red' | null = null;
                          if (status !== 'idle') {
                            if (correct.has(id)) resolved = 'green';
                            else if (isSelected && !correct.has(id)) resolved = 'red';
                          }
                          return (
                            <PressOption
                              key={`mc-${id}`}
                              active={status === 'idle' ? isSelected : false}
                              resolved={resolved}
                              size="sm"
                              onClick={() => {
                                if (status !== 'idle') return;
                                setMultiSel((prev) => {
                                  const has = prev.includes(id);
                                  const next = has ? prev.filter(x => x !== id) : [...prev, id];
                                  try { hapticSelect(); } catch {}
                                  return next;
                                });
                              }}
                              disabled={status !== 'idle'}
                            >
                              {renderWithBold(text)}
                            </PressOption>
                          );
                        });
                      })()}
                    </div>
                  )}

                  {task.answer_type === 'word_letters' && (
                    <div className="mt-auto mb-16">
                      <div className="rounded-2xl bg-white/5 border border-white/10 p-2 space-y-3" style={{ overflowX: 'hidden' }}>
                      {(() => {
                        const opts = ((task.options || []) as string[]) || [];
                        const layout = computeRows(opts.length);
                        let start = 0;
                        return layout.map((cols, rowIdx) => {
                          const slice = opts.slice(start, start + cols);
                            const row = (
                            <div key={`wl-row-${rowIdx}`} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)}, 1fr)` }}>
                              {slice.map((ch, localIdx) => {
                                const i = start + localIdx;
                                const used = lettersSel.includes(i);
                                if (used) {
                                  return (
                                    <div
                                      key={`wl-imprint-${i}`}
                                      className="rounded-xl border-2 border-dashed border-white/20 h-14 w-full"
                                      aria-hidden
                                    />
                                  );
                                }
                                return (
                                  <PressLetter
                                    key={`${ch}-${i}`}
                                    letter={ch}
                                    onClick={() => { setLettersSel(prev => [...prev, i]); try { hapticSelect(); } catch {} }}
                                    disabled={status !== 'idle'}
                                  />
                                );
                              })}
                            </div>
                          );
                          start += cols;
                          return row;
                        });
                      })()}
                      </div>
                    </div>
                  )}

                  {task.answer_type === 'cards' && (
                    <div className="mt-auto mb-16">
                      <div className="rounded-2xl bg-white/5 border border-white/10 p-2" style={{ overflowX: 'hidden' }}>
                      {(() => {
                        const opts = ((task.options || []) as string[]) || [];
                        const layout = computeRows(opts.length);
                        let start = 0;
                        return layout.map((cols, rowIdx) => {
                          const slice = opts.slice(start, start + cols);
                            const row = (
                            <div key={`cd-row-${rowIdx}`} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)}, 1fr)` }}>
                              {slice.map((txt, localIdx) => {
                                const i = start + localIdx;
                                if (selectedCard === i) {
                                  return (
                                    <div
                                      key={`cd-imprint-${i}`}
                                      className="rounded-xl border-2 border-dashed border-white/20 w-full"
                                      style={{ minHeight: 44 }}
                                      aria-hidden
                                    />
                                  );
                                }
                                return (
                                  <DraggableCard
                                    key={`${txt}-${i}`}
                                    text={txt}
                                    disabled={status !== 'idle'}
                                    onDropToBox={() => { if (status === 'idle') { try { hapticSelect(); } catch {} setSelectedCard(i); } }}
                                    getBoxRect={() => cardBoxRect}
                                  />
                                );
                              })}
                            </div>
                          );
                          start += cols;
                          return row;
                        });
                      })()}
                      </div>
                    </div>
                  )}

                  {task.answer_type === 'connections' && (
                    <div className="mt-auto mb-16">
                      <div ref={connContainerRef} className="relative rounded-2xl bg-white/5 border border-white/10 p-3">
                        {/* Линии */}
                        <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" style={{ left: 0, top: 0, zIndex: 1 }}>
                          {connLines.map((ln, i) => {
                            const cx = ln.laneX;
                            const pts = `${ln.from.x},${ln.from.y} ${cx},${ln.from.y} ${cx},${ln.to.y} ${ln.to.x},${ln.to.y}`;
                            return (
                              <polyline key={`ln-${i}`} points={pts} stroke={ln.color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            );
                          })}
                        </svg>
                        <div className="grid grid-cols-2 gap-6 relative" style={{ zIndex: 2 }}>
                          {/* Слева: задачи из task_text разметки (1)...(1) */}
                          <div className="flex flex-col gap-2 pr-2">
                            {(() => {
                              const left = parseMcOptions(task.task_text || '');
                              return left.map(({ id, text: t }, i) => {
                                const isActive = status === 'idle' && connActiveTask === i;
                                const isConnected = (connMap[i] || 0) > 0;
                                const activeVisual = status === 'idle' ? (isActive || isConnected) : false;
                                let resolved: 'green' | 'red' | null = null;
                                if (status !== 'idle') {
                                  const correctMap = parseCorrectDigits(task.correct || '', left.length);
                                  resolved = (connMap[i] || 0) === (correctMap[i] || 0) ? 'green' : 'red';
                                }
                                return (
                                  <div key={`lt-${id}`} ref={(el) => { connTaskRefs.current[i] = el; }}>
                                    <PressOption
                                      active={activeVisual}
                                      resolved={resolved}
                                      size="xs"
                                      onClick={() => {
                                        if (status !== 'idle') return;
                                        const leftNow = parseMcOptions(task.task_text || '');
                                        const optsNow = (task.options || [])?.length || 0;
                                        if ((connMap[i] || 0) > 0) {
                                          // Уже подключена: снять соединение и сбросить активность
                                          setConnMap((prevMap) => {
                                            const next = prevMap.slice();
                                            next[i] = 0;
                                            return next;
                                          });
                                          setConnActiveTask(null);
                                          scheduleConnRecompute(leftNow.length, optsNow, status);
                                          try { hapticSelect(); } catch {}
                                          return;
                                        }
                                        // Иначе просто активируем/деактивируем для выбора справа
                                        setConnActiveTask((prev) => (prev === i ? null : i));
                                        try { hapticSelect(); } catch {}
                                      }}
                                      disabled={status !== 'idle'}
                                    >
                                      {renderWithBold(t)}
                                    </PressOption>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                          {/* Справа: опции */}
                          <div className="flex flex-col gap-2 pl-2">
                            {(() => {
                              const opts = ((task.options || []) as string[]) || [];
                              const left = parseMcOptions(task.task_text || '');
                              const assigned = new Set<number>((connMap || []).filter(v => (v || 0) > 0));
                              return opts.map((optText, j) => {
                                const isAssignedToActive = (connActiveTask != null) && (connMap[connActiveTask] === (j + 1));
                                const isTaken = assigned.has(j + 1);
                                return (
                                  <div key={`rt-${j}`} ref={(el) => { connOptionRefs.current[j] = el; }}>
                                    <PressOption
                                      active={status === 'idle' ? (isAssignedToActive || isTaken) : false}
                                      size="xs"
                                      onClick={() => {
                                        if (status !== 'idle') return;
                                        if (connActiveTask == null) return;
                                        setConnMap((prev) => {
                                          const next = prev.slice();
                                          // Разрешаем присоединять несколько задач к одной опции (many-to-one)
                                          next[connActiveTask] = j + 1;
                                          return next;
                                        });
                                        try { hapticSelect(); } catch {}
                                        scheduleConnRecompute(left.length, opts.length, status);
                                      }}
                                      disabled={status !== 'idle'}
                                    >
                                      {renderWithBold(optText)}
                                    </PressOption>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(task.answer_type === 'position') && (
                    <div className="mt-auto mb-16">
                      <div className="rounded-2xl bg-white/5 border border-white/10 p-2">
                        {(() => {
                          const items = parsePositionItems(task.task_text || '');
                          // карта id -> текст
                          const map = new Map<number, string>(items.map(it => [it.id, it.text]));
                          const ordered = (posOrder.length > 0 ? posOrder : items.map(it => it.id))
                            .map((id) => ({ id, text: map.get(id) || '' }))
                            .filter(x => x.id != null);
                          const resolvedMap: Record<number, 'green' | 'red' | null> = {};
                          if (status !== 'idle') {
                            for (const { id } of ordered) {
                              resolvedMap[id] = posCorrectIds.has(id) ? 'green' : 'red';
                            }
                          }
                          return (
                            <PositionList
                              items={ordered}
                              onReorder={(nextIds) => { if (status === 'idle') setPosOrder(nextIds); }}
                              disabled={status !== 'idle'}
                              resolvedMap={resolvedMap}
                            />
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {task.answer_type === 'painting' && (
                    <div className="mt-auto mb-16">
                      <div className="rounded-2xl bg-white/5 border border-white/10">
                        {/* Панель инструментов */}
                        <div className="flex items-center gap-2 p-2 border-b border-white/10 flex-wrap">
                          <PressOption
                            active={paintTool === 'pen'}
                            onClick={() => setPaintTool('pen')}
                            disabled={status !== 'idle'}
                            resolved={null}
                            size="xs"
                            fullWidth={false}
                            variant="default"
                          >
                            КАРАНДАШ
                          </PressOption>
                          <PressOption
                            active={paintTool === 'eraser'}
                            onClick={() => setPaintTool('eraser')}
                            disabled={status !== 'idle'}
                            resolved={null}
                            size="xs"
                            fullWidth={false}
                            variant="default"
                          >
                            ЛАСТИК
                          </PressOption>
                          <div className="mx-1 h-6 w-px bg-white/10" />
                          {['#ffffff', '#f87171', '#f59e0b', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa'].map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => { setPaintColor(c); setPaintTool('pen'); }}
                              disabled={status !== 'idle'}
                              aria-label={`Цвет ${c}`}
                              className={`w-6 h-6 rounded-full border ${paintColor === c ? 'border-white' : 'border-white/20'} ${status !== 'idle' ? 'opacity-60 cursor-not-allowed' : ''}`}
                              style={{ background: c }}
                            />
                          ))}
                          <div className="ml-auto flex items-center gap-2">
                            <span className="text-xs text-white/60">Толщина</span>
                            {[2, 4, 6].map((w) => (
                              <button
                                key={`w-${w}`}
                                type="button"
                                onClick={() => setPaintWidth(w)}
                                disabled={status !== 'idle'}
                                className={`rounded-full border ${paintWidth === w ? 'border-white' : 'border-white/15'} px-2 py-1 text-xs ${status !== 'idle' ? 'opacity-60 cursor-not-allowed' : ''}`}
                              >
                                {w}px
                              </button>
                            ))}
                            <div className="mx-1 h-6 w-px bg-white/10" />
                            <PressOption
                              active={false}
                              onClick={() => { if (status === 'idle') clearPainting(); }}
                              disabled={status !== 'idle'}
                              resolved={null}
                              size="xs"
                              fullWidth={false}
                              variant="default"
                            >
                              ОЧИСТИТЬ
                            </PressOption>
                          </div>
                        </div>
                        {/* Холст */}
                        <div ref={paintBoxRef} className="p-2" onWheel={onPaintWheel} style={{ touchAction: 'none' }}>
                          <div className="rounded-xl border border-white/10 bg-black/40 overflow-hidden" style={{ height: paintViewportH, touchAction: 'none' }}>
                            <div
                              ref={paintViewRef}
                              style={{ transform: `translate(${paintTx}px, ${paintTy}px) scale(${paintScale})`, transformOrigin: '0 0', touchAction: 'none' }}
                            >
                              <canvas
                                ref={paintCanvasRef}
                                onPointerDown={onPaintDown}
                                onPointerMove={onPaintMove}
                                onPointerUp={onPaintUp}
                                onPointerCancel={onPaintUp}
                                onTouchStart={onTouchStartCanvas}
                                onTouchMove={onTouchMoveCanvas}
                                onTouchEnd={onTouchEndCanvas}
                                onTouchCancel={onTouchEndCanvas}
                                className={`${status !== 'idle' ? 'pointer-events-none opacity-80' : ''}`}
                                style={{ touchAction: 'none', display: 'block' }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Редактор кода для it_code / it_code_2 */}
                  {(task.answer_type === 'it_code' || task.answer_type === 'it_code_2') && (
                    <div className="mt-4 mb-20">
                      <CodeEditorPanel
                        lang={codeLang}
                        setLang={setCodeLang}
                        code={codeBy[codeLang] || ''}
                        onChange={(val) => setCodeBy(prev => ({ ...prev, [codeLang]: val }))}
                        onRun={async () => {
                          if (codeRunning) return;
                          const currentCode = (codeBy[codeLang] || '').trim();
                          setCodeOut([]);
                          setCodeRunning(true);
                          if (!currentCode) {
                            setCodeOut([`Ошибка: код пуст.`, `Укажи решение и попробуй снова.`]);
                            setCodeRunning(false);
                            return;
                          }
                          if (codeLang === 'python') {
                            try {
                              const py = await ensurePyodide();
                              // перенаправим stdout/stderr в консоль
                              py.setStdout({ batched: (s: string) => { if (s) setCodeOut(prev => [...prev, s]); } });
                              py.setStderr({ batched: (s: string) => { if (s) setCodeOut(prev => [...prev, s]); } });
                              await py.runPythonAsync(currentCode);
                            } catch (e: any) {
                              setCodeOut(prev => [...prev, String(e?.message || e)]);
                            } finally {
                              setCodeRunning(false);
                            }
                          } else {
                            const out = await runRemote(codeLang as any, currentCode);
                            setCodeOut(out);
                            setCodeRunning(false);
                          }
                        }}
                        running={codeRunning}
                        consoleLines={codeOut}
                      />
                    </div>
                  )}

                  {task.answer_type === 'text' && !/(\(input_box\))/.test(task.task_text || '') && (
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Ответ"
                      disabled={status !== 'idle'}
                      className="w-full rounded-2xl px-4 py-3 bg-white/5 border border-white/10 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  )}

                  {/* input-ответ перемещён в фиксированный нижний блок */}

                  {/* кнопка переехала вниз в фиксированный бар */}
                </>
              ) : (
                <div className="text-sm text-muted">Загрузка…</div>
              )}
            </div>

            {/* Нижний фиксированный блок: фидбек + кнопка (скрыт во время загрузки) */}
            {!loading && !showFinish && (
              <div className="fixed inset-x-0 bottom-0 bg-[var(--bg)] border-t border-white/10" style={{ zIndex: 100 }}>
                {/* Фидбек появится над кнопкой */}
                {status !== 'idle' && (
                  <div className={`mx-4 mt-1 mb-1 rounded-2xl px-4 py-3 font-semibold flex items-center justify-between ${status === 'correct' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'}`}>
                    <div className="flex items-center gap-2">
                      <span>{status === 'correct' ? '✓' : '✕'}</span>
                      <span>{status === 'correct' ? 'Правильно!' : 'Неправильно'}</span>
                    </div>
                  </div>
                )}
                {task && (task.answer_type === 'input' || task.answer_type === 'num_input' || task.answer_type === 'listening' || task.answer_type === 'it_code' || task.answer_type === 'painting') && (
                  <div className="px-4 mb-2">
                    <input
                      value={(() => {
                        if (status === 'wrong') {
                          let vars: string[] = [];
                          if (task.answer_type === 'num_input' || task.answer_type === 'listening') {
                            vars = parseAnswerPipe(task.correct || '');
                          } else if (task.answer_type === 'it_code') {
                            const list = parseAnswerList(task.correct || '');
                            const pipe = parseAnswerPipe(task.correct || '');
                            const set = new Set<string>();
                            for (const v of list) { const vv = v.trim(); if (vv) set.add(vv); }
                            for (const v of pipe) { const vv = v.trim(); if (vv) set.add(vv); }
                            vars = Array.from(set);
                          } else if (task.answer_type === 'input') {
                            // Для input показываем варианты из pipe, чтобы не путать запятую в десятичной дроби со списком
                            vars = parseAnswerPipe(task.correct || '');
                          } else {
                            vars = parseAnswerList(task.correct || '');
                          }
                          const disp = (vars.length > 0 ? vars : [task.correct || '']).filter(Boolean).join(' | ');
                          return disp;
                        }
                        return text;
                      })()}
                      onChange={(e) => {
                        const raw = e.target.value || '';
                        if (task.answer_type === 'num_input' || task.answer_type === 'listening') {
                          // Разрешаем цифры, пробелы, знак и десятичные разделители "." и ","
                          const filtered = raw.replace(/[^\d.,+\-\s]/g, '');
                          setText(filtered);
                        } else {
                          setText(raw);
                        }
                      }}
                      placeholder={(task.answer_type === 'num_input' || task.answer_type === 'listening') ? 'Введи число...' : 'Напиши ответ...'}
                      aria-label="Ответ"
                      disabled={status !== 'idle'}
                      inputMode={(task.answer_type === 'num_input' || task.answer_type === 'listening') ? ((isIOSDevice ? 'decimal' : 'numeric') as any) : undefined}
                      pattern={(task.answer_type === 'num_input' || task.answer_type === 'listening') ? '[0-9.,+-]*' : undefined}
                      className={`w-full max-w-[640px] mx-auto rounded-2xl px-4 py-3 outline-none disabled:opacity-60 disabled:cursor-not-allowed text-center font-extrabold text-base ${
                        status === 'correct'
                          ? 'border border-green-500/60 bg-green-600/10 text-green-400'
                          : (status === 'wrong'
                              ? 'border border-red-500/60 bg-red-600/10 text-red-400'
                              : 'bg-white/5 border border-white/10')
                      }`}
                    />
                  </div>
                )}
                {task && task.answer_type === 'table_num_input' && (() => {
                  const columns = Math.max(1, tableColumnCount || 1);
                  return (
                    <div className="px-4 mb-2">
                      <div className="px-4 py-4 rounded-2xl bg-white/5 border border-white/10 max-w-[640px] mx-auto overflow-x-auto">
                        <div className="min-w-[260px]">
                          <div
                            className="grid gap-2 text-center text-xs font-semibold tracking-[0.3em] text-white/70"
                            style={{ gridTemplateColumns: `repeat(${columns}, minmax(32px, 1fr))` }}
                          >
                            {Array.from({ length: columns }).map((_, idx) => (
                              <div key={`tbl-letter-${idx}`}>{tableLetterLabel(idx)}</div>
                            ))}
                          </div>
                          <div
                            className="mt-2 grid gap-2"
                            style={{ gridTemplateColumns: `repeat(${columns}, minmax(32px, 1fr))` }}
                          >
                            {Array.from({ length: columns }).map((_, idx) => {
                              const value = tableNums[idx] || '';
                              if (status === 'idle') {
                                return (
                                  <input
                                    key={`tbl-cell-${idx}`}
                                    value={value}
                                    onChange={(e) => handleTableCellChange(idx, e.target.value)}
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={1}
                                    disabled={status !== 'idle'}
                                    className="rounded-2xl border border-white/20 bg-white/5 py-3 text-center font-extrabold text-lg text-white focus:outline-none focus:border-white/50 transition-colors"
                                    onFocus={(e) => e.currentTarget.select()}
                                  />
                                );
                              }
                              const correctDigit = tableCorrectDigits[idx] ?? '';
                              const userDigit = (tableNums[idx] || '').trim();
                              const isCorrect = correctDigit === userDigit;
                              return (
                                <div
                                  key={`tbl-cell-res-${idx}`}
                                  className={`rounded-2xl py-3 text-center font-extrabold text-lg border ${
                                    isCorrect
                                      ? 'border-green-500/60 bg-green-600/15 text-green-300'
                                      : 'border-red-500/60 bg-red-600/15 text-red-300'
                                  }`}
                                >
                                  {correctDigit || '–'}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {task && task.answer_type === 'it_code_2' && (
                  <div className="px-4 mb-2 max-w-[640px] mx-auto grid gap-2">
                    <input
                      value={status === 'idle' ? itc2Top : (() => {
                        const parts = String(task.correct || '').split('&');
                        return String(parts[0] || '').trim().replace(/[^\d]+/g, '');
                      })()}
                      onChange={(e) => {
                        const raw = e.target.value || '';
                        const filtered = raw.replace(/[^\d]+/g, '');
                        setItc2Top(filtered);
                      }}
                      placeholder="Верхний ответ..."
                      aria-label="Верхний ответ"
                      disabled={status !== 'idle'}
                      inputMode={'numeric' as any}
                      pattern={'[0-9]*'}
                      className={`w-full rounded-2xl px-4 py-3 outline-none disabled:opacity-60 disabled:cursor-not-allowed text-center font-extrabold text-base ${
                        status === 'correct'
                          ? 'border border-green-500/60 bg-green-600/10 text-green-400'
                          : (status === 'wrong'
                              ? 'border border-red-500/60 bg-red-600/10 text-red-400'
                              : 'bg-white/5 border border-white/10')
                      }`}
                    />
                    <input
                      value={status === 'idle' ? itc2Bottom : (() => {
                        const parts = String(task.correct || '').split('&');
                        return String(parts[1] || '').trim().replace(/[^\d]+/g, '');
                      })()}
                      onChange={(e) => {
                        const raw = e.target.value || '';
                        const filtered = raw.replace(/[^\d]+/g, '');
                        setItc2Bottom(filtered);
                      }}
                      placeholder="Нижний ответ..."
                      aria-label="Нижний ответ"
                      disabled={status !== 'idle'}
                      inputMode={'numeric' as any}
                      pattern={'[0-9]*'}
                      className={`w/full rounded-2xl px-4 py-3 outline-none disabled:opacity-60 disabled:cursor-not-allowed text-center font-extrabold text-base ${
                        status === 'correct'
                          ? 'border border-green-500/60 bg-green-600/10 text-green-400'
                          : (status === 'wrong'
                              ? 'border border-red-500/60 bg-red-600/10 text-red-400'
                              : 'bg-white/5 border border-white/10')
                      }`}
                    />
                  </div>
                )}
                <div className="px-4 pt-0 pb-[calc(env(safe-area-inset-bottom)+24px)]">
                  {status === 'idle' ? (
                    <LessonButton text="ОТВЕТИТЬ" onClick={check} baseColor="#3c73ff" className={!canAnswer ? 'opacity-60 cursor-not-allowed' : ''} disabled={!canAnswer} />
                  ) : (
                    <LessonButton text="ПРОДОЛЖИТЬ" onClick={() => { setStreakFlash(null); onContinue(); }} baseColor={status === 'correct' ? '#16a34a' : '#dc2626'} />
                  )}
                </div>
              </div>
            )}
          </motion.div>
          {confirmExit && (
            <BottomSheet open title="" onClose={() => setConfirmExit(false)} dimBackdrop panelBg={'var(--bg)'}>
              <div className="grid gap-4 text-center">
                <div className="text-lg font-semibold">Если выйдешь, потеряешь прогресс этого урока</div>
                <PressCta
                  onClick={() => {
                    try { hapticSelect(); } catch {}
                    setConfirmExit(false);
                  }}
                  text="ПРОДОЛЖИТЬ"
                  baseColor="#3c73ff"
                />
                <button
                  type="button"
                  onClick={() => {
                    try { hapticTiny(); } catch {}
                    setConfirmExit(false);
                    if (isPlus) {
                      setTimeout(() => { try { onClose(); } catch {} }, 220);
                    } else {
                      setShowExitAd(true);
                    }
                  }}
                  className="w-full py-2 text-red-400 font-extrabold"
                  style={{ background: 'transparent' }}
                >
                  ВЫЙТИ
                </button>
              </div>
            </BottomSheet>
          )}
          {showExitAd && !isPlus && (
            <ExitPromo
              onSkip={() => {
                try { hapticTiny(); } catch {}
                setShowExitAd(false);
                setTimeout(() => { try { onClose(); } catch {} }, 120);
              }}
              onSubscribe={() => {
                try { hapticSelect(); } catch {}
                setShowExitAd(false);
                try { navigate('/subscription'); } catch {}
                setTimeout(() => { try { onClose(); } catch {} }, 0);
              }}
            />
          )}
        </>
      )}
    </AnimatePresence>
  );
}



function ExitPromo({ onSkip, onSubscribe }: { onSkip: () => void; onSubscribe: () => void }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = (t: number) => {
      const p = Math.min(1, (t - start) / 5000);
      setPct(p);
      if (p < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const ready = pct >= 0.999;
  return (
    <div className="fixed inset-0 z-[190]" style={{ background: '#01347a' }}>
      <img src="/subs/sub_pic.svg" alt="PLUS" className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none" style={{ transform: 'translateY(100px)' }} />
      {!ready && (
        <div className="absolute left-5 w-14 h-14" style={{ top: 120 }}>
          <div className="relative w-14 h-14 rounded-full" style={{ background: `conic-gradient(#fff ${Math.round(pct * 360)}deg, rgba(255,255,255,0.25) 0)` }}>
            <div className="absolute inset-1 rounded-full" style={{ background: '#01347a' }} />
          </div>
        </div>
      )}
      {ready && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-28 w-[min(92%,680px)] px-4">
          <PressCta text="КУПИТЬ ПОДПИСКУ" onClick={onSubscribe} />
          <button
            type="button"
            className="w-full mt-4 font-extrabold tracking-wider text-[#2f5bff]"
            onClick={onSkip}
            style={{ background: 'transparent' }}
          >
            НЕТ СПАСИБО
          </button>
        </div>
      )}
    </div>
  );
}

function PressOption({ active, children, onClick, disabled, resolved, size = 'md', fullWidth = true, variant = 'default' }: { active: boolean; children: React.ReactNode; onClick: () => void; disabled?: boolean; resolved?: 'green' | 'red' | null; size?: 'xs' | 'sm' | 'md'; fullWidth?: boolean; variant?: 'default' | 'black' }) {
  const [pressed, setPressed] = useState(false);
  const isGreen = resolved === 'green';
  const isRed = resolved === 'red';
  const base = variant === 'black' ? '#000000' : (isGreen ? '#16a34a' : (isRed ? '#dc2626' : (active ? '#3c73ff' : '#2a3944')));
  const shadowHeight = size === 'xs' ? 3 : (size === 'sm' ? 4 : 6);
  function darken(hex: string, amount = 18) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount / 100))));
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  }
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => { if (!disabled) { setPressed(true); /* дергаем хаптик только один раз */ try { hapticSelect(); } catch {} } }}
      onMouseDown={(e) => { e.preventDefault(); }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onClick={() => { if (!disabled) onClick(); }}
      className={`${fullWidth ? 'w-full' : ''} ${size === 'xs' ? 'rounded-lg px-2 py-1.5 text-xs' : (size === 'sm' ? 'rounded-xl px-3 py-2 text-sm' : 'rounded-2xl px-4 py-3')} border ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${
        isGreen ? 'border-green-500/60 text-green-400'
        : isRed ? 'border-red-500/60 text-red-400'
        : (variant === 'black' ? 'border-white/10 text-white' : (active ? 'border-[#3c73ff] text-[#3c73ff]' : 'border-white/10 text-white'))
      }`}
      animate={{ y: (disabled ? false : pressed) ? shadowHeight : 0, boxShadow: (disabled ? false : pressed) ? `0px 0px 0px ${darken(base, 18)}` : `0px ${shadowHeight}px 0px ${darken(base, 18)}` }}
      transition={{ duration: 0 }}
      style={{ background: variant === 'black' ? '#000000' : (isGreen ? 'rgba(34,197,94,0.10)' : (isRed ? 'rgba(220,38,38,0.10)' : (active ? 'rgba(60,115,255,0.10)' : 'rgba(255,255,255,0.05)'))) }}
    >
      {children}
    </motion.button>
  );
}

function PressLetter({ letter, onClick, disabled }: { letter: string; onClick: () => void; disabled?: boolean }) {
  const [pressed, setPressed] = useState(false);
  const base = '#2a3944';
  const shadowHeight = 6;
  function darken(hex: string, amount = 18) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount / 100))));
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  }
  return (
    <motion.button
      type="button"
      onPointerDown={() => { if (!disabled) setPressed(true); }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onClick={() => { if (!disabled) onClick(); }}
      className={`rounded-xl border font-extrabold grid place-items-center h-14 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      animate={{ y: pressed ? shadowHeight : 0, boxShadow: pressed ? `0px 0px 0px ${darken(base, 18)}` : `0px ${shadowHeight}px 0px ${darken(base, 18)}` }}
      transition={{ duration: 0 }}
      style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.10)' }}
    >
      <span className="text-base">{letter}</span>
    </motion.button>
  );
}
// CTA с «нижней полоской» через box-shadow, мгновенная реакция
function PressCta({ text, onClick, baseColor = '#3c73ff', shadowHeight = 6, disabled = false, textSizeClass = '' }: { text: string; onClick?: () => void; baseColor?: string; shadowHeight?: number; disabled?: boolean; textSizeClass?: string }) {
  const [pressed, setPressed] = useState(false);
  function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const h = hex.replace('#', '').trim();
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16), g = parseInt(h[1] + h[1], 16), b = parseInt(h[2] + h[2], 16);
      return { r, g, b };
    }
    if (h.length === 6) {
      const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
      return { r, g, b };
    }
    return null;
  }
  function darken(hex: string, amount = 18): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount / 100))));
    return `rgb(${f(rgb.r)}, ${f(rgb.g)}, ${f(rgb.b)})`;
  }
  const shadowColor = darken(baseColor, 18);
  const effectivePressed = disabled ? false : pressed;
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onPointerDown={() => { if (!disabled) setPressed(true); }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onClick={() => { if (!disabled) onClick?.(); }}
      className={`w-full rounded-2xl px-5 py-4 font-extrabold ${textSizeClass} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      animate={{ y: effectivePressed ? shadowHeight : 0, boxShadow: effectivePressed ? `0px 0px 0px ${shadowColor}` : `0px ${shadowHeight}px 0px ${shadowColor}` }}
      transition={{ duration: 0 }}
      style={{ background: baseColor, color: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}
    >
      {text}
    </motion.button>
  );
}


function LetterBox({ value, editable, lettersSel, options, onRemove, status }: { value: string; editable: boolean; lettersSel: number[]; options: string[]; onRemove: (pos: number) => void; status: 'idle' | 'correct' | 'wrong' }) {
  const letters = editable ? lettersSel.map(i => options[i] ?? '') : (value || '').split('');
  const isResolved = status !== 'idle';
  const hasLetters = letters.length > 0;
  const idleEmpty = !isResolved && !hasLetters;
  const containerClass = isResolved
    ? (status === 'correct'
        ? 'border-green-500/60 bg-green-600/10 text-green-400'
        : 'border-red-500/60 bg-red-600/10 text-red-400')
    : (idleEmpty
        ? 'border-white/10 bg-white/5'
        : 'border-transparent bg-transparent');
  const padClass = idleEmpty ? 'px-2 py-1' : 'p-0';
  const styleBox: React.CSSProperties = idleEmpty ? { minWidth: 64, minHeight: 40 } : {};
  return (
    <span
      className={`inline-flex items-center gap-1 align-middle rounded-xl border ${containerClass} ${padClass}`}
      style={styleBox}
    >
      {hasLetters && (
        letters.map((ch, idx) => (
          <motion.button
            key={`${ch}-${idx}`}
            type="button"
            className={`w-7 h-7 grid place-items-center rounded-lg border ${editable && !isResolved ? 'border-white/15 bg-white/10' : 'border-transparent bg-transparent'} font-extrabold text-sm`}
            onClick={() => { if (editable && !isResolved) { try { hapticSelect(); } catch {} onRemove(idx); } }}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {ch}
          </motion.button>
        ))
      )}
    </span>
  );
}

function InputBox({ value, editable, onChange, status }: { value: string; editable: boolean; onChange: (v: string) => void; status: 'idle' | 'correct' | 'wrong' }) {
  const ref = useRef<HTMLInputElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [boxWidth, setBoxWidth] = useState<number>(64);
  const isResolved = status !== 'idle';
  const containerClass = isResolved
    ? (status === 'correct'
        ? 'border-green-500/60 bg-green-600/10 text-green-400'
        : 'border-red-500/60 bg-red-600/10 text-red-400')
    : 'border-white/10 bg-white/5';
  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    // только буквы (кириллица/латиница), без пробелов/цифр/символов
    const raw = e.target.value || '';
    const filtered = raw.replace(/[^\p{L}]+/gu, '');
    if (filtered !== raw) {
      const el = e.target;
      const pos = el.selectionStart || filtered.length;
      onChange(filtered);
      requestAnimationFrame(() => { try { el.setSelectionRange(pos - 1, pos - 1); } catch {} });
    } else {
      onChange(raw);
    }
  };
  useEffect(() => {
    // ширина = max(64px, текст + внутренние отступы ~12px)
    const w = Math.max(64, Math.round(((measureRef.current?.offsetWidth as number) || 0) + 12));
    setBoxWidth(w);
  }, [value]);
  return (
    <span className={`relative inline-flex items-center gap-1 align-middle rounded-xl border px-1.5 py-0.5 ${containerClass}`} style={{ width: boxWidth, minWidth: 64, minHeight: 36 }}>
      {/* невидимый измеритель ширины */}
      <span ref={measureRef} className="invisible absolute -z-10 whitespace-pre font-extrabold px-0.5 text-sm">{value || ' '}</span>
      {editable ? (
        <input
          ref={ref}
          value={value}
          onChange={onInput}
          placeholder=""
          disabled={isResolved}
          className="bg-transparent outline-none border-0 px-1.5 py-0.5 font-extrabold w-full caret-transparent text-center text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      ) : (
        <span className={`px-1.5 py-0.5 font-extrabold text-sm ${isResolved ? '' : 'text-white'}`}>{value}</span>
      )}
    </span>
  );
}

function CardBox({ cardText, onRemove, setRect, status }: { cardText: string; onRemove: () => void; setRect: (r: DOMRect | null) => void; status: 'idle' | 'correct' | 'wrong' }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const update = () => { try { setRect(el.getBoundingClientRect()); } catch {} };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true } as any);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update as any); };
  }, [setRect]);
  // Периодически обновляем rect во время DnD, чтобы хит-тест был точнее
  useEffect(() => {
    const id = setInterval(() => {
      try { const el = ref.current; if (el) setRect(el.getBoundingClientRect()); } catch {}
    }, 120);
    return () => clearInterval(id as any);
  }, [setRect]);
  const hasCard = !!cardText;
  const resolvedClass = status === 'idle' ? 'border-white/10 bg-white/5' : (status === 'correct' ? 'border-green-500/60 bg-green-600/10 text-green-400' : 'border-red-500/60 bg-red-600/10 text-red-400');
  return (
    <div ref={ref} className={`inline-flex items-center justify-center align-middle rounded-xl border ${resolvedClass}`} style={{ minWidth: 96, minHeight: 56, padding: 6 }}>
      {hasCard ? (
        <button type="button" onClick={() => { if (status === 'idle') onRemove(); }} disabled={status !== 'idle'} className={`rounded-lg px-2 py-1 text-sm font-semibold border ${status === 'idle' ? 'bg-white/10 border-white/15' : (status === 'correct' ? 'text-green-400 bg-green-600/10 border-green-500/60' : 'text-red-400 bg-red-600/10 border-red-500/60')} ${status !== 'idle' ? 'opacity-60 cursor-not-allowed' : ''}`}>
          {cardText}
        </button>
      ) : (
        <span className="text-white/60 text-sm">Перетащи сюда</span>
      )}
    </div>
  );
}

function DraggableCard({ text, disabled, onDropToBox, getBoxRect }: { text: string; disabled: boolean; onDropToBox: () => void; getBoxRect: () => DOMRect | null }) {
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState<number>(0.9);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      if (!origin.current) return;
      setPos({ x: e.clientX - origin.current.x, y: e.clientY - origin.current.y });
    };
    const up = (e: PointerEvent) => {
      setDragging(false);
      setPos(null);
      // хит-тест бокса
      const br = getBoxRect();
      if (br) {
        const cx = e.clientX, cy = e.clientY;
        const tol = 12; // небольшая толерантность, чтобы не «срывалась» у края
        if (cx >= br.left - tol && cx <= br.right + tol && cy >= br.top - tol && cy <= br.bottom + tol) onDropToBox();
      }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, getBoxRect, onDropToBox]);

  const onDown = (e: React.PointerEvent) => {
    if (disabled) return;
    const rect = cardRef.current?.getBoundingClientRect();
    origin.current = { x: (e.clientX - (rect?.left || 0)), y: (e.clientY - (rect?.top || 0)) };
    setDragging(true);
    setPreviewScale(0.9);
  };

  return (
    <div className="relative">
      {/* оригинальная карточка, скрывается во время перетаскивания */}
      <div
        ref={cardRef}
        onPointerDown={onDown}
        className={`rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold select-none w-full ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'} ${dragging ? 'opacity-0' : 'opacity-100'}`}
        style={{ minHeight: 40 }}
      >
        {text}
      </div>
      {/* плавающий «превью»-клон, движется за пальцем */}
      {dragging && pos && (
        <div
          className="fixed pointer-events-none rounded-xl border border-white/10 bg-white/10 backdrop-blur px-3 py-2 text-sm font-semibold"
          style={{ left: 0, top: 0, transform: `translate(${pos.x}px, ${pos.y}px) scale(${previewScale})`, zIndex: 9999, minWidth: 80, minHeight: 36 }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

// Упорядочивание: вертикальный список с перетаскиванием пальцем/мышью
function PositionList({
  items,
  onReorder,
  disabled,
  resolvedMap,
}: {
  items: Array<{ id: number; text: string }>;
  onReorder: (nextIds: number[]) => void;
  disabled: boolean;
  resolvedMap: Record<number, 'green' | 'red' | null>;
}) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const origin = useRef<{ id: number; offsetX: number; offsetY: number } | null>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());

  const setItemRef = (id: number) => (el: HTMLDivElement | null) => {
    itemRefs.current.set(id, el);
  };

  useEffect(() => {
    if (!draggingId) return;
    const move = (e: PointerEvent) => {
      if (!origin.current) return;
      setPos({ x: e.clientX - origin.current.offsetX, y: e.clientY - origin.current.offsetY });
      // Подбор целевого индекса по центрам элементов
      const orderIds = items.map((it) => it.id);
      const centers: Array<{ id: number; cy: number }> = [];
      for (const it of items) {
        const el = itemRefs.current.get(it.id);
        const r = el?.getBoundingClientRect();
        if (!r) continue;
        centers.push({ id: it.id, cy: (r.top + r.bottom) / 2 });
      }
      const y = e.clientY;
      let targetIndex = -1;
      for (let i = 0; i < centers.length; i++) {
        if (y < centers[i].cy) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex === -1) targetIndex = orderIds.length;
      const fromIndex = orderIds.indexOf(origin.current.id);
      if (fromIndex === -1) return;
      // Корректируем вставку, если двигаем вниз
      const insertIndex = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
      if (insertIndex === fromIndex) return;
      const next = orderIds.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(insertIndex, 0, moved);
      onReorder(next);
    };
    const up = () => {
      setDraggingId(null);
      setPos(null);
      origin.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [draggingId, items, onReorder]);

  const onDown = (id: number) => (e: React.PointerEvent) => {
    if (disabled) return;
    try { e.preventDefault(); } catch {}
    const el = itemRefs.current.get(id);
    const rect = el?.getBoundingClientRect();
    const offX = (e.clientX - (rect?.left || 0));
    const offY = (e.clientY - (rect?.top || 0));
    origin.current = { id, offsetX: offX, offsetY: offY };
    setDraggingId(id);
    setPos({ x: e.clientX - offX, y: e.clientY - offY });
  };

  return (
    <div className="flex flex-col gap-2">
      {items.map(({ id, text }) => {
        const isDragging = draggingId === id;
        const resolved = resolvedMap[id] || null;
        const stateClass =
          resolved === 'green'
            ? 'border-green-500/60 bg-green-600/10 text-green-400'
            : resolved === 'red'
            ? 'border-red-500/60 bg-red-600/10 text-red-400'
            : 'border-white/10 bg-white/5 text-white';
        return (
          <div key={`pos-${id}`} className="relative">
            <div
              ref={setItemRef(id)}
              onPointerDown={onDown(id)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold select-none w-full ${stateClass} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'} ${isDragging ? 'opacity-0' : 'opacity-100'}`}
              style={{ minHeight: 44, touchAction: 'none' }}
            >
              {text}
            </div>
            {isDragging && pos && (
              <div
                className="fixed pointer-events-none rounded-xl border border-white/10 bg-white/10 backdrop-blur px-3 py-2 text-sm font-semibold"
                style={{ left: 0, top: 0, transform: `translate(${pos.x}px, ${pos.y}px)`, zIndex: 9999, minWidth: 80, minHeight: 36 }}
              >
                {text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Текст, который автоматически подбирает размер шрифта под ширину контейнера
function FitWidthText({ text, maxPx = 14, minPx = 10, className = '' }: { text: string; maxPx?: number; minPx?: number; className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const [fontPx, setFontPx] = useState<number>(maxPx);
  const [nowrap, setNowrap] = useState<boolean>(true);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const span = spanRef.current;
    if (!container || !span) return;
    // Начинаем с максимального размера и уменьшаем пока не влезет в ширину
    let size = maxPx;
    setNowrap(true);
    span.style.whiteSpace = 'nowrap';
    span.style.wordBreak = 'normal';
    span.style.fontSize = `${size}px`;
    // ограничим кол-во итераций
    let guard = 20;
    while (guard-- > 0 && size > minPx && span.scrollWidth > container.clientWidth) {
      size = Math.max(minPx, size - 1);
      span.style.fontSize = `${size}px`;
    }
    setFontPx(size);
    // Если даже на минимальном не влезает — разрешаем перенос слов
    if (span.scrollWidth > container.clientWidth) {
      setNowrap(false);
      span.style.whiteSpace = 'normal';
      span.style.wordBreak = 'break-word';
    }
  }, [maxPx, minPx, text]);

  useLayoutEffect(() => { measure(); }, [measure, text]);
  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measure]);

  return (
    <div ref={containerRef} className={className} style={{ width: '100%', overflow: 'hidden' }}>
      <span
        ref={spanRef}
        style={{ display: 'block', fontSize: `${fontPx}px`, lineHeight: 1.2, whiteSpace: nowrap ? 'nowrap' : 'normal', wordBreak: nowrap ? 'normal' : 'break-word' }}
        title={text}
      >
        {text}
      </span>
    </div>
  );
}

// Рендер CSV-таблицы для it_code
function ItCodeTable({ rows, status, kind = 'task' }: { rows: string[][]; status: 'idle' | 'correct' | 'wrong'; kind?: 'task' | 'correct' }) {
  if (!rows || rows.length === 0) return null as any;
  const cols = rows.reduce((m, r) => Math.max(m, r?.length || 0), 0);
  const resolvedClass = (kind === 'correct' && status !== 'idle')
    ? (status === 'correct'
        ? 'border-green-500/60 bg-green-600/10 text-green-400'
        : 'border-red-500/60 bg-red-600/10 text-red-400')
    : 'border-white/10 bg-white/5';
  const header = rows[0] || [];
  const body = rows.slice(1);
  return (
    <div className={`rounded-2xl border ${resolvedClass} p-2 overflow-x-auto block w-full`}>
      <table className="w-full text-sm border-separate border-spacing-0 table-fixed">
        <colgroup>
          {new Array(cols).fill(0).map((_, i) => (
            <col key={`col-${i}`} style={{ width: `${(100 / Math.max(1, cols)).toFixed(4)}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {new Array(cols).fill(0).map((_, i) => (
              <th key={`h-${i}`} className="px-2 py-1 bg-white/10 border border-white/10 text-left align-top">
                <FitWidthText text={(header[i] ?? '')} maxPx={14} minPx={10} className="font-extrabold" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={`r-${ri}`}>
              {new Array(cols).fill(0).map((_, ci) => (
                <td key={`c-${ri}-${ci}`} className="px-2 py-1 border border-white/10 align-top whitespace-normal break-all">
                  {(r[ci] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ========= Простой редактор кода с подсветкой и нумерацией строк =========
function CodeEditorPanel({
  lang, setLang, code, onChange, onRun, running, consoleLines,
}: {
  lang: 'python' | 'cpp' | 'csharp' | 'java';
  setLang: (l: 'python' | 'cpp' | 'csharp' | 'java') => void;
  code: string;
  onChange: (v: string) => void;
  onRun: () => void;
  running: boolean;
  consoleLines: string[];
}) {
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLPreElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState<number>(0);
  const [scrollLeft, setScrollLeft] = useState<number>(0);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [charWidth, setCharWidth] = useState<number>(8);
  const lineHeight = 22;
  const editorHeight = 320;
  const [sel, setSel] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  const lineCount = Math.max(1, (code.match(/\n/g)?.length || 0) + 1);
  const gutterLines = useMemo(() => new Array(lineCount).fill(0).map((_, i) => String(i + 1)), [lineCount]);
  const gutterDigits = useMemo(() => Math.max(2, String(lineCount).length), [lineCount]);
  const gutterWidth = useMemo(() => Math.max(28, Math.round(charWidth * gutterDigits + 12)), [charWidth, gutterDigits]);

  const setScroll = (st: number, sl: number) => {
    setScrollTop(st);
    setScrollLeft(sl);
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setScroll(el.scrollTop, el.scrollLeft);
  };

  const highlighted = useMemo(() => {
    return highlightCode(lang, code);
  }, [lang, code]);

  // Измеряем ширину символа для корректной отрисовки выделения
  useLayoutEffect(() => {
    const m = measureRef.current;
    if (!m) return;
    const sample = 'MMMMMMMMMM';
    m.textContent = sample;
    const w = m.getBoundingClientRect().width / sample.length;
    if (Number.isFinite(w) && w > 0) setCharWidth(w);
  }, [lang]);

  // Работа с выделением текста
  const captureSelection = () => {
    const el = textRef.current;
    if (!el) return;
    const start = Math.max(0, el.selectionStart || 0);
    const end = Math.max(0, el.selectionEnd || 0);
    setSel(start <= end ? { start, end } : { start: end, end: start });
  };
  const onKeyUp = () => captureSelection();
  const onMouseUp = () => captureSelection();
  const onSelect = () => captureSelection();

  const selectionRects = useMemo(() => {
    if (!code || sel.start === sel.end) return [] as Array<{ top: number; left: number; width: number }>;
    const lines = code.split('\n');
    const rects: Array<{ top: number; left: number; width: number }> = [];
    const toLineCol = (offset: number): { line: number; col: number } => {
      let rem = offset;
      for (let i = 0; i < lines.length; i++) {
        const len = (lines[i] ?? '').length;
        if (rem <= len) return { line: i, col: rem };
        rem -= (len + 1);
      }
      return { line: lines.length - 1, col: (lines[lines.length - 1] ?? '').length };
    };
    const a = toLineCol(sel.start);
    const b = toLineCol(sel.end);
    const startLine = Math.min(a.line, b.line);
    const endLine = Math.max(a.line, b.line);
    const startCol = (a.line <= b.line) ? a.col : b.col;
    const endCol = (a.line <= b.line) ? b.col : a.col;
    for (let li = startLine; li <= endLine; li++) {
      const isFirst = li === startLine;
      const isLast = li === endLine;
      const lineText = lines[li] ?? '';
      const fromCol = isFirst ? startCol : 0;
      const toCol = isLast ? endCol : lineText.length;
      if (toCol > fromCol) {
        rects.push({
          top: li * lineHeight,
          left: fromCol * charWidth,
          width: (toCol - fromCol) * charWidth,
        });
      }
    }
    return rects;
  }, [code, sel, charWidth]);

  // Прокрутка контейнера так, чтобы каретка была видна; при alignLeft=true возвращаем горизонталь влево
  function ensureCaretVisible(text: string, pos: number, alignLeft = false) {
    const container = scrollRef.current;
    if (!container) return;
    const before = text.slice(0, pos);
    const lineIndex = (before.match(/\n/g) || []).length;
    const lineTop = lineIndex * lineHeight;
    const lineBottom = lineTop + lineHeight;
    let nextTop = container.scrollTop;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + editorHeight;
    if (lineTop < viewTop) nextTop = lineTop;
    else if (lineBottom > viewBottom) nextTop = lineBottom - editorHeight;
    const nextLeft = alignLeft ? 0 : container.scrollLeft;
    container.scrollTo({ top: nextTop, left: nextLeft, behavior: 'auto' });
    setScroll(nextTop, nextLeft);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5">
      {/* Tabs */}
      <div className="flex items-center gap-2 p-2 border-b border-white/10">
        {(['python','cpp','csharp','java'] as const).map((l) => (
          <PressOption
            key={l}
            active={lang === l}
            onClick={() => setLang(l)}
            disabled={false}
            resolved={null}
            size="xs"
            fullWidth={false}
            variant="default"
          >
            {l === 'python' ? 'Python' : (l === 'cpp' ? 'C++' : (l === 'csharp' ? 'C#' : 'Java'))}
          </PressOption>
        ))}
      </div>
      {/* Editor */}
      <div className="relative" style={{ height: editorHeight }}>
        <div ref={scrollRef} className="absolute inset-0 overflow-auto" onScroll={onScroll}>
          <div className="grid min-w-full" style={{ gridTemplateColumns: `${gutterWidth}px 1fr` }}>
            {/* Line numbers gutter */}
            <pre
              ref={gutterRef}
              className="m-0 p-3 pr-1 text-right border-r border-white/10 text-white/60 select-none"
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace', lineHeight: '22px' }}
            >
              {gutterLines.join('\n')}
            </pre>
            {/* Code column */}
            <div className="relative">
              {/* local highlight styles */}
              <style
                dangerouslySetInnerHTML={{ __html: `.hl-str{color:#34d399}.hl-cmt{color:#9ca3af}.hl-num{color:#f59e0b}.hl-kw{color:#60a5fa;font-weight:600}` }}
              />
              <pre
                ref={preRef}
                className="m-0 p-3"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace', lineHeight: '22px', whiteSpace: 'pre' }}
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
              {/* selection overlay */}
              <div className="absolute inset-0 pointer-events-none" style={{ padding: 12 }}>
                {selectionRects.map((r, i) => (
                  <div key={`sel-${i}`} style={{ position: 'absolute', top: r.top, left: r.left, width: r.width, height: lineHeight, background: 'rgba(60,115,255,0.28)' }} />
                ))}
              </div>
              {/* input layer */}
              <textarea
                ref={textRef}
                value={code}
                onChange={(e) => { onChange(e.target.value); captureSelection(); }}
                onKeyDown={(e) => {
                  const el = textRef.current;
                  if (!el) return;
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = el.selectionStart || 0;
                    const end = el.selectionEnd || 0;
                    const insert = '  ';
                    const next = code.slice(0, start) + insert + code.slice(end);
                    onChange(next);
                    requestAnimationFrame(() => { try { el.setSelectionRange(start + insert.length, start + insert.length); } catch {} });
                    return;
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const start = el.selectionStart || 0;
                    const before = code.slice(0, start);
                    const after = code.slice(el.selectionEnd || start);
                    const prevLineStart = before.lastIndexOf('\n') + 1;
                    const prevLine = before.slice(prevLineStart);
                    const baseIndentMatch = prevLine.match(/^[\\t ]*/);
                    let indent = baseIndentMatch ? baseIndentMatch[0] : '';
                    const trimmed = prevLine.trim();
                    if (lang === 'python') {
                      if (/[=:]\\s*$/.test(prevLine) || trimmed.endsWith(':')) indent += '  ';
                    } else {
                      if (trimmed.endsWith('{')) indent += '  ';
                      if (/^\\}/.test(after)) indent = indent.replace(/ {1,2}$/, '');
                    }
                    const insert = '\n' + indent;
                    const next = before + insert + after;
                    onChange(next);
                    requestAnimationFrame(() => {
                      const pos = start + insert.length;
                      try { el.setSelectionRange(pos, pos); } catch {}
                      try { ensureCaretVisible(next, pos, true); } catch {}
                    });
                  }
                }}
                onKeyUp={onKeyUp}
                onMouseUp={onMouseUp}
                onSelect={onSelect}
                spellCheck={false}
                className="absolute inset-0 w-full h-full resize-none bg-transparent outline-none border-0 text-transparent caret-white p-3"
                wrap="off"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace', lineHeight: '22px', whiteSpace: 'pre', overflow: 'hidden' }}
              />
              <span ref={measureRef} className="invisible absolute left-0 top-0" aria-hidden style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace' }} />
            </div>
          </div>
        </div>
      </div>
      {/* Run button */}
      <div className="p-2 border-t border-white/10">
        <div className="max-w-[640px] mx-auto">
          <PressCta text={running ? 'запуск...' : 'запустить'} onClick={() => { if (!running) onRun(); }} baseColor="#3c73ff" disabled={running} />
        </div>
      </div>
      {/* Console */}
      <div className="p-2 pt-0">
        <div className="rounded-2xl border border-white/10 bg-black/60 p-3 min-h-[80px] max-h-[220px] overflow-auto font-mono text-sm">
          {consoleLines.length === 0 ? (
            <div className="text-white/40">Консоль пуста. Нажми «запустить», чтобы увидеть вывод.</div>
          ) : (
            <pre className="whitespace-pre-wrap break-words m-0">{consoleLines.join('\n')}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightCode(lang: 'python' | 'cpp' | 'csharp' | 'java', code: string): string {
  const raw = String(code ?? '');
  // 1) Выносим строки и комментарии в плейсхолдеры (чтобы внутри них не подсвечивать ключевые слова/числа)
  const strings: string[] = [];
  const comments: string[] = [];
  let masked = raw.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, (m) => {
    strings.push(m);
    const tok = String.fromCharCode(0xe000 + (strings.length - 1)); // приватный диапазон Юникода
    return tok;
  });
  if (lang === 'python') {
    masked = masked.replace(/#.*$/gm, (m) => {
      comments.push(m);
      const tok = String.fromCharCode(0xe100 + (comments.length - 1));
      return tok;
    });
  } else {
    masked = masked
      .replace(/\/\/.*$/gm, (m) => {
        comments.push(m);
        const tok = String.fromCharCode(0xe100 + (comments.length - 1));
        return tok;
      })
      .replace(/\/\*[\s\S]*?\*\//g, (m) => {
        comments.push(m);
        const tok = String.fromCharCode(0xe100 + (comments.length - 1));
        return tok;
      });
  }
  // 2) Экранируем HTML
  let src = escapeHtml(masked);
  // 3) Подсвечиваем ключевые слова и числа (теперь плейсхолдеры не мешают)
  const kw = (() => {
    if (lang === 'python') return ['class','def','return','if','else','elif','for','while','try','except','import','from','as','with','lambda','pass','break','continue','yield','True','False','None'];
    if (lang === 'cpp') return ['int','float','double','char','bool','void','auto','string','class','struct','return','if','else','for','while','switch','case','break','continue','new','delete','public','private','protected','virtual','static','const','using','namespace','include'];
    if (lang === 'csharp') return ['int','string','var','class','struct','enum','interface','using','namespace','public','private','protected','internal','static','const','readonly','void','return','new','if','else','for','foreach','while','switch','case','break','continue','try','catch','finally'];
    return ['int','double','float','char','boolean','void','class','interface','enum','package','import','public','private','protected','static','final','new','return','if','else','for','while','switch','case','break','continue','try','catch','finally'];
  })();
  const kwRe = new RegExp(`\\b(${kw.join('|')})\\b`, 'g');
  src = src.replace(kwRe, (_m, k) => `<span class="hl-kw">${k}</span>`);
  src = src.replace(/\b(\d+(?:\.\d+)?)\b/g, (_m, d) => `<span class="hl-num">${d}</span>`);
  // 4) Возвращаем строки и комментарии на место с подсветкой
  for (let i = 0; i < strings.length; i++) {
    const tok = String.fromCharCode(0xe000 + i);
    const html = `<span class="hl-str">${escapeHtml(strings[i])}</span>`;
    src = src.split(tok).join(html);
  }
  for (let i = 0; i < comments.length; i++) {
    const tok = String.fromCharCode(0xe100 + i);
    const html = `<span class="hl-cmt">${escapeHtml(comments[i])}</span>`;
    src = src.split(tok).join(html);
  }
  return src || '&nbsp;';
}
/* ===== Экран завершения урока ===== */
function FinishOverlay({ answersTotal, answersCorrect, hadAnyMistakes, elapsedMs, onDone, onReady, canProceed }: { answersTotal: number; answersCorrect: number; hadAnyMistakes: boolean; elapsedMs: number; onDone: () => void; onReady: () => void; canProceed: boolean }) {
  // Проигрываем звук завершения при показе экрана результатов
  useEffect(() => { try { sfx.playLessonFinished(); } catch {} }, []);
  const percent = Math.max(0, Math.min(100, Math.round((answersCorrect / Math.max(1, answersTotal)) * 100)));
  const formatTime = (ms: number) => {
    const totalSec = Math.max(0, Math.round((ms || 0) / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const ss = String(s).padStart(2, '0');
    return `${m}:${ss}`;
  };
  const perfLabel = percent > 90 ? 'Фантастика' : (percent >= 50 ? 'Хорошо' : 'Неплохо');
  const darkInner = '#0a111d';
  const green = '#22c55e';
  const blue = '#3b82f6';
  // Глобальная карта, чтобы карточки анимировались только один раз даже при повторных монтажах
  const onceMap: Record<string, boolean> = (typeof window !== 'undefined')
    ? (((window as any).__exampliCardOnce = (window as any).__exampliCardOnce || {}))
    : ({} as any);
  // анимации проигрываются по одному разу при монтировании
  function hexToRgb(hex: string) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgba(hex: string, a: number) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const Card = ({ id, title, value, color, delay, duration = 0.6, initialX = -20, onDoneAnim }: { id: string; title: string; value: string; color: string; delay: number; duration?: number; initialX?: number; onDoneAnim?: () => void }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    useLayoutEffect(() => {}, [title]);

    return (
      <motion.div
        initial={onceMap[id] ? false : { x: initialX, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={onceMap[id] ? { duration: 0 } : { duration, delay }}
        onAnimationComplete={() => { if (!onceMap[id]) onceMap[id] = true; onDoneAnim && onDoneAnim(); }}
        className="rounded-3xl overflow-hidden border w-28 sm:w-32"
        style={{ borderColor: rgba(color, 0.55), background: rgba(color, 0.18) }}
        ref={containerRef}
      >
        <div className="px-2 font-extrabold uppercase text-center leading-tight grid place-items-center text-xs sm:text-sm"
          style={{ color: '#0a111d', minHeight: 44 }}>
          {title}
        </div>
        <div className="px-4 pb-4">
          <div className="rounded-2xl grid place-items-center" style={{ background: darkInner, minHeight: 48 }}>
            <div className="text-2xl font-extrabold tabular-nums" style={{ color }}>{value}</div>
          </div>
        </div>
      </motion.div>
    );
  };
  return (
    <div className="flex flex-col items-center justify-between w-full min-h-[70vh] pt-8 pb-6 overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-start gap-6 w-full">
        <img src="/lessons/ending.svg" alt="" className="w-80 h-80 -mt-10" />
        <div className="text-4xl font-extrabold text-center">Урок пройден!</div>
        {!hadAnyMistakes && (
          <div className="text-lg text-white/90 text-center"><span className="font-extrabold">0</span> ошибок. Ты суперкомпьютер!</div>
        )}
        <div className="mt-2 w-full flex justify-center items-start gap-4">
          {/* последовательная анимация: вторая стартует после первой с паузой */}
          {(() => { const firstDuration = 0.6; const firstDelay = 0.0; const secondDelay = firstDelay + firstDuration + 0.3; return (
            <>
              <Card id="perf" key="perf" title={perfLabel} value={`${percent}%`} color={green} delay={firstDelay} duration={firstDuration} initialX={-60} />
              <Card id="time" key="time" title="Время" value={formatTime(elapsedMs)} color={blue} delay={secondDelay} duration={firstDuration} initialX={60} onDoneAnim={onReady} />
            </>
          ); })()}
        </div>
      </div>
      <div className="w-full px-4 mt-12 mb-56">
        <PressCta text="продолжить" textSizeClass="text-2xl" baseColor="#3c73ff" onClick={() => { try { hapticSelect(); } catch {} onDone(); }} disabled={!canProceed} />
      </div>
    </div>
  );
}