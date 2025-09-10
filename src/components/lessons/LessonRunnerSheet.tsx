import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { hapticSelect, hapticTiny } from '../../lib/haptics';

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
    try { ok ? hapticSelect() : hapticTiny(); } catch {}
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

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="sheet-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
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
            {/* прогресс */}
            <div className="px-5 pt-3 pb-2 border-b border-white/10">
              <div className="progress"><div style={{ width: `${Math.round(((idx + (status !== 'idle' ? 1 : 0)) / Math.max(1, tasks.length || 1)) * 100)}%` }} /></div>
            </div>

            <div className="p-4 grid gap-4">
              {task ? (
                <>
                  <div className="text-sm text-muted">{task.prompt}</div>
                  <div className="card text-left">
                    <div className="text-lg leading-relaxed">
                      {partsWithUnderline(task.task_text).map((p, i) => p.t === 'text' ? <span key={i}>{p.v}</span> : <span key={i} className="px-1 font-semibold">____</span>)}
                    </div>
                  </div>

                  {/* ответы */}
                  {(task.answer_type === 'choice' || task.answer_type === 'word_letters') && (
                    <div className="grid gap-2">
                      {(task.options || []).map((opt) => {
                        const active = choice === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setChoice(opt)}
                            className={`w-full rounded-2xl px-4 py-3 border ${active ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-white/10 text-white'}`}
                            style={{ background: active ? 'rgba(60,115,255,0.10)' : 'rgba(255,255,255,0.05)' }}
                          >
                            {opt}
                          </button>
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

                  {/* кнопка ответа и фидбек */}
                  <div className="mt-2">
                    {status === 'idle' ? (
                      <button type="button" className={`btn w-full ${!canAnswer ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={!canAnswer} onClick={check}>ПРОВЕРИТЬ</button>
                    ) : (
                      <div className="grid gap-3">
                        <div className={`card flex items-center justify-between ${status === 'correct' ? 'text-green-400' : 'text-red-400'}`}>
                          <div className="font-semibold flex items-center gap-2">
                            <span>{status === 'correct' ? '✓' : '✕'}</span>
                            <span>{status === 'correct' ? 'Sehr gut!' : 'Неправильно'}</span>
                          </div>
                          {status === 'wrong' && (
                            <div className="text-sm">Правильный ответ: <span className="font-semibold">{task.correct}</span></div>
                          )}
                        </div>
                        <button type="button" className="btn w-full" onClick={next}>ПРОДОЛЖИТЬ</button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted">Загрузка…</div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}


