import { useEffect, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { hapticSelect, hapticTiny, hapticSuccess, hapticError } from '../../lib/haptics';
import BottomSheet from '../sheets/BottomSheet';
import LessonButton from './LessonButton';

type TaskRow = {
  id: number | string;
  lesson_id: number | string;
  prompt: string;
  task_text: string; // contains (underline)
  order_index?: number | null;
  answer_type: 'choice' | 'text' | 'word_letters';
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
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [confirmExit, setConfirmExit] = useState<boolean>(false);
  const task = tasks[idx];

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, lesson_id, prompt, task_text, answer_type, options, correct, order_index')
        .eq('lesson_id', lessonId)
        .order('order_index', { ascending: true })
        .order('id', { ascending: true })
        .limit(15);
      const rows = (data as any[]) || [];
      // страховка: отсортировать по order_index, затем id
      rows.sort((a: any, b: any) => {
        const ao = (a?.order_index ?? 0) as number; const bo = (b?.order_index ?? 0) as number;
        if (ao !== bo) return ao - bo;
        return Number(a?.id || 0) - Number(b?.id || 0);
      });
      setTasks(rows as any);
      setIdx(0);
      setProgress(0);
      setChoice(null);
      setText('');
      setLettersSel([]);
      setStatus('idle');
    })();
  }, [open, lessonId]);

  function partsWithMarkers(src: string): Array<{ t: 'text' | 'blank' | 'letterbox' | 'inputbox'; v?: string }>{
    const res: Array<{ t: 'text' | 'blank' | 'letterbox' | 'inputbox'; v?: string }> = [];
    const re = /(\(underline\)|\(letter_box\)|\(input_box\))/g;
    let last = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(src))){
      if (m.index > last) res.push({ t: 'text', v: src.slice(last, m.index) });
      const token = m[0];
      if (token === '(underline)') res.push({ t: 'blank' });
      else if (token === '(letter_box)') res.push({ t: 'letterbox' });
      else if (token === '(input_box)') res.push({ t: 'inputbox' });
      last = m.index + m[0].length;
    }
    if (last < src.length) res.push({ t: 'text', v: src.slice(last) });
    return res;
  }

  const canAnswer = useMemo(() => {
    if (!task) return false;
    if (task.answer_type === 'choice') return !!choice;
    if (task.answer_type === 'word_letters') return (lettersSel.length > 0);
    if (task.answer_type === 'text') return text.trim().length > 0;
    return false;
  }, [task, choice, text, lettersSel]);

  function check(){
    if (!task) return;
    let user = '';
    if (task.answer_type === 'text') user = text.trim();
    else if (task.answer_type === 'choice') user = (choice || '');
    else if (task.answer_type === 'word_letters') {
      const opts = (task.options || []) as string[];
      user = lettersSel.map(i => opts[i] ?? '').join('');
    }
    const ok = user === (task.correct || '');
    setStatus(ok ? 'correct' : 'wrong');
    try { ok ? hapticSuccess() : hapticError(); } catch {}
  }

  function next(){
    const total = Math.max(1, tasks.length || 1);
    setProgress(Math.min(total, progress + 1));
    if (idx + 1 < tasks.length){
      setIdx(idx + 1);
      setChoice(null);
      setText('');
      setLettersSel([]);
      setStatus('idle');
    } else {
      onClose();
    }
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
            {/* верхняя панель: только прогресс, возврат через Telegram BackButton */}
            <div className="px-5 pt-2 pb-2 border-b border-white/10">
              <div className="progress"><div style={{ width: `${Math.round(((idx + (status !== 'idle' ? 1 : 0)) / Math.max(1, tasks.length || 1)) * 100)}%`, background: '#3c73ff' }} /></div>
            </div>

            <div className="p-4 flex flex-col gap-4 pb-16 min-h-[78vh]">
              {task ? (
                <>
                  <div className="text-sm text-muted">{task.prompt}</div>
                  <div className="card text-left">
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
                        return (
                          <InputBox
                            key={`ib-${i}`}
                            value={status === 'idle' ? text : (task.correct || '')}
                            editable={status === 'idle' && task.answer_type === 'text'}
                            onChange={(val) => setText(val)}
                            status={status}
                          />
                        );
                      })}
                    </div>
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
                    <div className="grid gap-2 mt-auto mb-10" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(48px,1fr))' }}>
                      {((task.options || []) as string[]).map((ch, i) => {
                        const used = lettersSel.includes(i);
                        if (used) return null;
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

            {/* Нижний фиксированный блок: фидбек + кнопка */}
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
                  <LessonButton text="ПРОДОЛЖИТЬ" onClick={() => { try { hapticTiny(); } catch {} next(); }} baseColor={status === 'correct' ? '#16a34a' : '#dc2626'} />
                )}
              </div>
            </div>
          </motion.div>
          {/* подтверждение выхода */}
          <BottomSheet open={confirmExit} onClose={() => setConfirmExit(false)} title="">
            <div className="grid gap-4 text-center">
              <div className="text-lg font-semibold">Если выйдешь, потеряешь XP этой лекции</div>
              <button type="button" className="btn w-full" onClick={() => setConfirmExit(false)}>ПРОДОЛЖИТЬ</button>
              <button
                type="button"
                onClick={() => { setConfirmExit(false); onClose(); }}
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
      className={`rounded-xl border font-extrabold grid place-items-center w-12 h-12 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      animate={{ y: pressed ? shadowHeight : 0, boxShadow: pressed ? `0px 0px 0px ${darken(base, 18)}` : `0px ${shadowHeight}px 0px ${darken(base, 18)}` }}
      transition={{ duration: 0 }}
      style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.10)' }}
    >
      {letter}
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
            className={`w-8 h-8 grid place-items-center rounded-lg border ${editable ? 'border-white/15 bg-white/10' : 'border-transparent bg-transparent'} font-extrabold`}
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
  const [boxWidth, setBoxWidth] = useState<number>(72);
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
    // ширина = max(72px, текст + внутренние отступы ~16px)
    const w = Math.max(72, Math.round(((measureRef.current?.offsetWidth as number) || 0) + 16));
    setBoxWidth(w);
  }, [value]);
  return (
    <span className={`relative inline-flex items-center gap-1 align-middle rounded-xl border px-2 py-1 ${containerClass}`} style={{ width: boxWidth, minWidth: 72, minHeight: 42 }}>
      {/* невидимый измеритель ширины */}
      <span ref={measureRef} className="invisible absolute -z-10 whitespace-pre font-extrabold px-1">{value || ' '}</span>
      {editable ? (
        <input
          ref={ref}
          value={value}
          onChange={onInput}
          placeholder=""
          className="bg-transparent outline-none border-0 px-2 py-1 font-extrabold w-full caret-transparent text-center"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      ) : (
        <span className={`px-2 py-1 font-extrabold ${isResolved ? '' : 'text-white'}`}>{value}</span>
      )}
    </span>
  );
}