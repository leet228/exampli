import { useEffect, useMemo, useState, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { hapticSelect, hapticTiny, hapticSuccess, hapticError, hapticStreakMilestone } from '../../lib/haptics';
import BottomSheet from '../sheets/BottomSheet';
import LessonButton from './LessonButton';
import { cacheGet, cacheSet, CACHE_KEYS } from '../../lib/cache';
import { spendEnergy, rewardEnergy, finishLesson } from '../../lib/userState';
import { sfx } from '../../lib/sfx';

type TaskRow = {
  id: number | string;
  lesson_id: number | string;
  prompt: string;
  task_text: string; // contains (underline)
  order_index?: number | null;
  answer_type: 'choice' | 'text' | 'word_letters' | 'cards' | 'multiple_choice' | 'input' | 'connections' | 'num_input';
  options: string[] | null;
  correct: string;
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
        const { data } = await supabase
          .from('tasks')
          .select('id, lesson_id, prompt, task_text, answer_type, options, correct, order_index')
          .eq('lesson_id', lessonId)
          .order('order_index', { ascending: true })
          .order('id', { ascending: true })
          .limit(50);
        rows = (data as any[]) || [];
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

  const canAnswer = useMemo(() => {
    if (!task) return false;
    if (task.answer_type === 'choice') return !!choice;
    if (task.answer_type === 'multiple_choice') return (multiSel.length > 0);
    if (task.answer_type === 'word_letters') return (lettersSel.length > 0);
    if (task.answer_type === 'cards') return (selectedCard != null);
    if (task.answer_type === 'text') return text.trim().length > 0;
    if (task.answer_type === 'input') return text.trim().length > 0;
  if (task.answer_type === 'num_input') return text.trim().length > 0;
  if (task.answer_type === 'connections') {
    const left = parseMcOptions(task.task_text || '');
    if (left.length === 0) return false;
    if (connMap.length !== left.length) return false;
    return connMap.every((v) => Number.isFinite(v) && (v as any) > 0);
  }
    return false;
}, [task, choice, text, lettersSel, selectedCard, multiSel, connMap]);

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

  function check(){
    if (!task) return;
    let user = '';
  if (task.answer_type === 'text' || task.answer_type === 'input') user = text.trim();
  else if (task.answer_type === 'num_input') user = text.trim().replace(/[^\d]/g, '');
    else if (task.answer_type === 'choice') user = (choice || '');
    else if (task.answer_type === 'multiple_choice') {
      // сравнение множеств как строк отсортированных id
      const sel = Array.from(new Set(multiSel)).sort((a, b) => a - b);
      const correct = Array.from(parseCorrectIds(task.correct || '')).sort((a, b) => a - b);
      user = sel.join(','); // для логов
      const ok = sel.length === correct.length && sel.every((v, i) => v === correct[i]);
      setStatus(ok ? 'correct' : 'wrong');
      try { ok ? hapticSuccess() : hapticError(); } catch {}
      try { ok ? sfx.playCorrect() : sfx.playWrong(); } catch {}
      // обновим метрики
      setAnswersTotal((v) => v + 1);
      if (ok) setAnswersCorrect((v) => v + 1); else setHadAnyMistakes(true);

      // Режим повторов: стрик не считаем, управляем очередью
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
            (async () => { try { const res = await rewardEnergy(bonus); const serverEnergy = res?.energy; if (typeof serverEnergy === 'number') { const clamped = Math.max(0, Math.min(25, Number(serverEnergy))); setEnergy((prevE) => Math.max(prevE || 0, clamped)); } } catch {} })();
          }
          return next;
        });
        try { const id = (task as any)?.id; if (!solvedRef.current.has(id)) { solvedRef.current.add(id); setProgressCount((p) => Math.min(PLANNED_COUNT, p + 1)); } } catch {}
      } else {
        setStreakLocal(0); setStreakFlash(null);
        setRepeatQueue((prev) => { const exists = prev.some((t) => String((t as any)?.id) === String((task as any)?.id)); return exists ? prev : [...prev, task]; });
      }
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
    }
    // Проверка правильности
    let ok = false;
  if (task.answer_type === 'text' || task.answer_type === 'input') {
      const userNorm = normalizeAnswer(user);
      const variants = parseAnswerList(task.correct || '');
      if (variants.length > 0) {
        ok = variants.some((v) => normalizeAnswer(v) === userNorm);
      } else {
        ok = userNorm === normalizeAnswer(task.correct || '');
      }
  } else if (task.answer_type === 'num_input') {
    const variants = parseAnswerPipe(task.correct || '');
    if (variants.length > 0) {
      ok = variants.some((v) => String(v).replace(/[^\d]/g, '') === user);
    } else {
      ok = user === String(task.correct || '').replace(/[^\d]/g, '');
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
    setLettersSel([]);
    setSelectedCard(null);
    setMultiSel([]);
    setConnActiveTask(null);
    setConnMap([]);
    setConnLines([]);
    setStatus('idle');
    setStreakFlash(null);
    setShowT(false);
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
        try { await finishLesson({ correct: true, elapsedMs: Math.max(0, Number(Date.now() - lessonStartedAt)) }); } catch {}
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
                  {(() => {
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
                          {(task.answer_type === 'multiple_choice' || task.answer_type === 'connections') ? null : partsWithMarkers(task.task_text).map((p, i) => {
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
                        })}
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
                                          for (let k = 0; k < next.length; k++) if (k !== connActiveTask && next[k] === (j + 1)) next[k] = 0;
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
                {task && (task.answer_type === 'input' || task.answer_type === 'num_input') && (
                  <div className="px-4 mb-2">
                    <input
                      value={(() => {
                        if (status === 'wrong') {
                          const vars = task.answer_type === 'num_input'
                            ? parseAnswerPipe(task.correct || '')
                            : parseAnswerList(task.correct || '');
                          const disp = (vars.length > 0 ? vars : [task.correct || '']).filter(Boolean).join(' | ');
                          return disp;
                        }
                        return text;
                      })()}
                      onChange={(e) => {
                        const raw = e.target.value || '';
                        if (task.answer_type === 'num_input') {
                          const filtered = raw.replace(/[^\d]+/g, '');
                          setText(filtered);
                        } else {
                          setText(raw);
                        }
                      }}
                      placeholder={task.answer_type === 'num_input' ? 'Введи число...' : 'Напиши ответ...'}
                      aria-label="Ответ"
                      disabled={status !== 'idle'}
                      inputMode={task.answer_type === 'num_input' ? ('numeric' as any) : undefined}
                      pattern={task.answer_type === 'num_input' ? '[0-9]*' : undefined}
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
          {/* подтверждение выхода */}
          <BottomSheet open={confirmExit} onClose={() => setConfirmExit(false)} title="" dimBackdrop panelBg={'var(--bg)'}>
            <div className="grid gap-4 text-center">
              <div className="text-lg font-semibold">Если выйдешь, потеряешь прогресс этого урока</div>
              <PressCta onClick={() => { try { hapticSelect(); } catch {} setConfirmExit(false); }} text="ПРОДОЛЖИТЬ" baseColor="#3c73ff" />
              <button
                type="button"
                onClick={() => { try { hapticTiny(); } catch {} setConfirmExit(false); setStreakLocal(0); setStreakFlash(null); setTimeout(() => { try { onClose(); } catch {} }, 220); }}
                className="w-full py-2 text-red-400 font-extrabold"
                style={{ background: 'transparent' }}
              >
                ВЫЙТИ
              </button>
            </div>
          </BottomSheet>
        </>
      )}
    </AnimatePresence>
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