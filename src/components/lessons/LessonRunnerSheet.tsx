import { useEffect, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { hapticSelect, hapticTiny, hapticSuccess, hapticError, hapticStreakMilestone } from '../../lib/haptics';
import BottomSheet from '../sheets/BottomSheet';
import LessonButton from './LessonButton';
import { cacheGet, cacheSet, CACHE_KEYS } from '../../lib/cache';
import { spendEnergy, rewardEnergy } from '../../lib/userState';

type TaskRow = {
  id: number | string;
  lesson_id: number | string;
  prompt: string;
  task_text: string; // contains (underline)
  order_index?: number | null;
  answer_type: 'choice' | 'text' | 'word_letters' | 'cards';
  options: string[] | null;
  correct: string;
};

export default function LessonRunnerSheet({ open, onClose, lessonId }: { open: boolean; onClose: () => void; lessonId: string | number }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [idx, setIdx] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [text, setText] = useState<string>('');
  const [lettersSel, setLettersSel] = useState<number[]>([]); // индексы выбранных букв из options
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [cardBoxRect, setCardBoxRect] = useState<DOMRect | null>(null);
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');
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
  const rewardKeyRef = useRef<number>(0);
  const task = tasks[idx];

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
      // сначала попробуем из localStorage (кеш урока)
      let rows: any[] | null = null;
      try {
        const raw = localStorage.getItem(`exampli:lesson_tasks:${lessonId}`);
        if (raw) rows = JSON.parse(raw) as any[];
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
        try { localStorage.setItem(`exampli:lesson_tasks:${lessonId}`, JSON.stringify(rows)); } catch {}
      }
      setTasks(rows as any);
      setIdx(0);
      setProgress(0);
      setChoice(null);
      setText('');
      setLettersSel([]);
      setSelectedCard(null);
      setCardBoxRect(null);
      setStatus('idle');
      setLoading(false);
    })();
  }, [open, lessonId]);

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

  const canAnswer = useMemo(() => {
    if (!task) return false;
    if (task.answer_type === 'choice') return !!choice;
    if (task.answer_type === 'word_letters') return (lettersSel.length > 0);
    if (task.answer_type === 'cards') return (selectedCard != null);
    if (task.answer_type === 'text') return text.trim().length > 0;
    return false;
  }, [task, choice, text, lettersSel, selectedCard]);

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
    if (task.answer_type === 'text') user = text.trim();
    else if (task.answer_type === 'choice') user = (choice || '');
    else if (task.answer_type === 'word_letters') {
      const opts = (task.options || []) as string[];
      user = lettersSel.map(i => opts[i] ?? '').join('');
    } else if (task.answer_type === 'cards') {
      const opts = (task.options || []) as string[];
      user = (selectedCard != null) ? (opts[selectedCard] ?? '') : '';
    }
    const ok = user === (task.correct || '');
    setStatus(ok ? 'correct' : 'wrong');
    try { ok ? hapticSuccess() : hapticError(); } catch {}
    // streak: только внутри урока, считаем подряд правильные ответы
    if (ok) {
      setStreakLocal((prev) => {
        const next = prev + 1;
        // показать флэш над прогрессом, начиная со 2 подряд
        if (next >= 2) {
          streakKeyRef.current += 1;
          setStreakFlash({ v: next, key: streakKeyRef.current });
          // Запускаем спец-анимацию через контроллер, чтобы она имела приоритет
          if (next === 5 || next === 10) {
            void streakCtrl.start({ scale: [1, 2.2, 0.9, 1], rotate: [0, -22, 14, 0], y: [-2, -16, -8, -2] }, { type: 'tween', ease: 'easeInOut', duration: 1.05 });
          } else {
            void streakCtrl.start({ scale: 1, rotate: 0, y: 0 }, { duration: 0.2 });
          }
        }
        // 5/10 — спец-анимация и хаптик
        if (next === 5 || next === 10) {
          try { hapticStreakMilestone(); } catch {}
          // бонус энергии немедленно при достижении 5/10
          const bonus: 2 | 5 = next === 5 ? 2 : 5;
          rewardKeyRef.current += 1;
          setRewardBonus(bonus);
          // локально увеличиваем энергию и кэш/события
          setEnergy((prevE) => {
            const n = Math.max(0, Math.min(25, (prevE || 0) + bonus));
            try {
              const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
              cacheSet(CACHE_KEYS.stats, { ...cs, energy: n });
              window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { energy: n } } as any));
            } catch {}
            return n;
          });
          // сервер: удалим последние 2/5 трат через RPC положительной дельтой и синхронизируем энергию
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
    } else {
      setStreakLocal(0);
      setStreakFlash(null);
    }
  }

  function next(){
    const total = Math.max(1, tasks.length || 1);
    setProgress(Math.min(total, progress + 1));
    if (idx + 1 < tasks.length){
      setIdx(idx + 1);
      setChoice(null);
      setText('');
      setLettersSel([]);
      setSelectedCard(null);
      setStatus('idle');
      // скрываем флэш стрика между заданиями
      setStreakFlash(null);
    } else {
      // завершение урока — сбрасываем локальный стрик
      setStreakLocal(0);
      setStreakFlash(null);
      onClose();
    }
  }

  function onContinue(){
    try { hapticTiny(); } catch {}
    // мгновенно уменьшаем энергию и иконку
    setEnergy(prev => {
      const nextVal = Math.max(0, Math.min(25, (prev || 0) - 1));
      try {
        const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
        cacheSet(CACHE_KEYS.stats, { ...cs, energy: nextVal });
        try { window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { energy: nextVal } } as any)); } catch {}
        // фоновое обновление на сервере (RPC с ленивой регенерацией)
        (async () => { try { await spendEnergy(); } catch {} })();
      } catch {}
      // если 0 — выходим из урока сразу (с учётом возможного бонуса)
      if (nextVal <= 0) {
        // вылет из урока по нехватке энергии — сбросить стрик
        setStreakLocal(0);
        setStreakFlash(null);
        onClose();
        return nextVal;
      }
      // иначе двигаем к следующему заданию
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
            {!loading && (
              <div className="px-5 pt-2 pb-2 border-b border-white/10 relative" ref={headerRef}>
                <div className="flex items-center justify-end gap-2">
                  <div className="progress flex-1 max-w-[70%]" ref={progressRef}>
                    <div style={{ width: `${Math.round(((idx + (status !== 'idle' ? 1 : 0)) / Math.max(1, tasks.length || 1)) * 100)}%`, background: (streakLocal >= 10 ? '#123ba3' : (streakLocal >= 5 ? '#2c58c7' : '#3c73ff')) }} />
                  </div>
                  <div className="flex items-center gap-1">
                    <img src={`/stickers/battery/${Math.max(0, Math.min(25, energy))}.svg`} alt="" aria-hidden className="w-8 h-8" />
                    <span className={[
                      'tabular-nums font-bold text-base',
                      energy <= 0 ? 'text-gray-400' : (energy <= 5 ? 'text-red-400' : 'text-green-400')
                    ].join(' ')}>{energy}</span>
                  </div>
                </div>
                {/* streak flash */}
                <AnimatePresence>
                  {streakFlash && (
                    <motion.div
                      key={`streak-${streakFlash.key}`}
                      initial={{ opacity: 0, y: -8, scale: 0.96, rotate: 0 }}
                      animate={{ opacity: 1, y: -2, scale: 1.0, rotate: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="absolute top-0 font-extrabold text-xs"
                      style={{ color: ((streakFlash?.v ?? 0) >= 10 ? '#123ba3' : ((streakFlash?.v ?? 0) >= 5 ? '#2c58c7' : '#3c73ff')), left: streakLeft }}
                    >
                      <motion.span initial={{ scale: 1, rotate: 0, y: 0 }} animate={streakCtrl}>
                        {streakFlash.v} ПОДРЯД
                      </motion.span>
                    </motion.div>
                  )}
                </AnimatePresence>
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

            <div className="p-4 flex flex-col gap-4 pb-16 min-h-[78vh]">
              {loading ? (
                <div className="flex flex-col items-center justify-center w-full min-h-[70vh]">
                  <img src="/lessons/loading_lesson.svg" alt="" className="w-full h-auto" />
                  <div className="mt-6 w-8 h-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
                </div>
              ) : task ? (
                <>
                  <div className="text-sm text-muted">{task.prompt}</div>
                  <div className="relative overflow-hidden">
                    <AnimatePresence initial={false} mode="wait">
                      <motion.div
                        key={`task-${idx}`}
                        initial={{ x: '20%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '-20%', opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="card text-left"
                      >
                        <div className="text-lg leading-relaxed">
                          {partsWithMarkers(task.task_text).map((p, i) => {
                        if (p.t === 'text') return <span key={i}>{p.v}</span>;
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
                                onClick={() => { try { hapticTiny(); } catch {} setSelectedCard(null); }}
                                className={`rounded-lg px-2 py-1 text-sm font-semibold border ${stateClass}`}
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
                    <div className="grid gap-2 mt-auto mb-10">
                      {(task.options || []).map((opt) => {
                        const active = choice === opt;
                        return (
                          <PressOption key={opt} active={active} onClick={() => { setChoice(opt); }}>
                            {opt}
                          </PressOption>
                        );
                      })}
                    </div>
                  )}

                  {task.answer_type === 'word_letters' && (
                    <div className="mt-auto mb-10">
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
                    <div className="mt-auto mb-10">
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

                  {task.answer_type === 'text' && !/(\(input_box\))/.test(task.task_text || '') && (
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Ответ"
                      className="w-full rounded-2xl px-4 py-3 bg-white/5 border border-white/10 outline-none"
                    />
                  )}

                  {/* кнопка переехала вниз в фиксированный бар */}
                </>
              ) : (
                <div className="text-sm text-muted">Загрузка…</div>
              )}
            </div>

            {/* Нижний фиксированный блок: фидбек + кнопка (скрыт во время загрузки) */}
            {!loading && (
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
                <div className="px-4 pt-0 pb-[calc(env(safe-area-inset-bottom)+10px)]">
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
              <div className="text-lg font-semibold">Если выйдешь, потеряешь XP этой лекции</div>
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



function PressOption({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  const [pressed, setPressed] = useState(false);
  const base = active ? '#3c73ff' : '#2a3944';
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
      onPointerDown={(e) => { setPressed(true); /* дергаем хаптик только один раз */ try { hapticSelect(); } catch {} }}
      onMouseDown={(e) => { e.preventDefault(); }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onClick={onClick}
      className={`w-full rounded-2xl px-4 py-3 border ${active ? 'border-[#3c73ff] text-[#3c73ff]' : 'border-white/10 text-white'}`}
      animate={{ y: pressed ? shadowHeight : 0, boxShadow: pressed ? `0px 0px 0px ${darken(base, 18)}` : `0px ${shadowHeight}px 0px ${darken(base, 18)}` }}
      transition={{ duration: 0 }}
      style={{ background: active ? 'rgba(60,115,255,0.10)' : 'rgba(255,255,255,0.05)' }}
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
function PressCta({ text, onClick, baseColor = '#3c73ff', shadowHeight = 6 }: { text: string; onClick?: () => void; baseColor?: string; shadowHeight?: number }) {
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
  return (
    <motion.button
      type="button"
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onClick={onClick}
      className="w-full rounded-2xl px-5 py-4 font-extrabold"
      animate={{ y: pressed ? shadowHeight : 0, boxShadow: pressed ? `0px 0px 0px ${shadowColor}` : `0px ${shadowHeight}px 0px ${shadowColor}` }}
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
            className={`w-7 h-7 grid place-items-center rounded-lg border ${editable ? 'border-white/15 bg-white/10' : 'border-transparent bg-transparent'} font-extrabold text-sm`}
            onClick={() => { if (editable) { try { hapticSelect(); } catch {} onRemove(idx); } }}
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
          className="bg-transparent outline-none border-0 px-1.5 py-0.5 font-extrabold w-full caret-transparent text-center text-sm"
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
        <button type="button" onClick={onRemove} className={`rounded-lg px-2 py-1 text-sm font-semibold border ${status === 'idle' ? 'bg-white/10 border-white/15' : (status === 'correct' ? 'text-green-400 bg-green-600/10 border-green-500/60' : 'text-red-400 bg-red-600/10 border-red-500/60')}`}>
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