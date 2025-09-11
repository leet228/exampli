import { useEffect, useMemo, useState } from 'react';
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
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [confirmExit, setConfirmExit] = useState<boolean>(false);
  const task = tasks[idx];

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, lesson_id, prompt, task_text, answer_type, options, correct')
        .eq('lesson_id', lessonId)
        .order('id', { ascending: true })
        .limit(15);
      setTasks((data as any) || []);
      setIdx(0);
      setProgress(0);
      setChoice(null);
      setText('');
      setStatus('idle');
    })();
  }, [open, lessonId]);

  function partsWithUnderline(src: string): Array<{ t: 'text' | 'blank'; v: string }>{
    const res: Array<{ t: 'text' | 'blank'; v: string }> = [];
    const re = /(\(underline\))/g;
    let last = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(src))){
      if (m.index > last) res.push({ t: 'text', v: src.slice(last, m.index) });
      res.push({ t: 'blank', v: '____' });
      last = m.index + m[0].length;
    }
    if (last < src.length) res.push({ t: 'text', v: src.slice(last) });
    return res;
  }

  const canAnswer = useMemo(() => {
    if (!task) return false;
    if (task.answer_type === 'choice' || task.answer_type === 'word_letters') return !!choice;
    if (task.answer_type === 'text') return text.trim().length > 0;
    return false;
  }, [task, choice, text]);

  function check(){
    if (!task) return;
    const user = (task.answer_type === 'text') ? text.trim() : (choice || '');
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
                      {partsWithUnderline(task.task_text).map((p, i) => (
                        p.t === 'text'
                          ? <span key={i}>{p.v}</span>
                          : (status === 'idle'
                              ? <span key={i} className="px-1 font-semibold">____</span>
                              : <span key={i} className="px-1 font-extrabold text-green-400">{task.correct}</span>
                            )
                        ))}
                    </div>
                  </div>

                  {/* ответы */}
                  {(task.answer_type === 'choice' || task.answer_type === 'word_letters') && (
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

                  {task.answer_type === 'text' && (
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