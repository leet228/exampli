import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { setUserSubjects } from '../lib/userState';

export default function Onboarding() {
  const [step, setStep] = useState<1 | 2>(1);
  const [level, setLevel] = useState<'OGE' | 'EGE' | null>(null);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => { (async () => { const { data } = await supabase.from('subjects').select('*').order('title'); setSubjects(data || []); })(); }, []);

  const visible = subjects.filter(s => !level || s.level === level);

  const toggle = (code: string) => {
    setPicked(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  const next = async () => {
    if (step === 1 && level) setStep(2);
    else if (step === 2 && picked.length > 0) {
      await setUserSubjects(picked);
      location.assign('/');
    }
  };

  return (
    <div className="space-y-4">
      {step === 1 && (
        <div className="space-y-4">
          <div className="card">
            <div className="text-xl font-semibold">Выбери направление</div>
            <div className="text-sm text-muted">Можно изменить позже</div>
          </div>
          <div className="grid gap-3">
            {(['OGE','EGE'] as const).map(l => (
              <button key={l} onClick={() => setLevel(l)} className={`skill text-left ${level===l ? 'ring-2 ring-[color:var(--accent)]' : ''}`}>
                <div className="text-lg font-semibold">{l === 'OGE' ? 'ОГЭ' : 'ЕГЭ'}</div>
                <div className="text-sm text-muted">{l === 'OGE' ? '9 класс' : '11 класс'}</div>
              </button>
            ))}
          </div>
          <button className="btn w-full" disabled={!level} onClick={next}>Далее</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="card">
            <div className="text-xl font-semibold">Выбери предметы</div>
            <div className="text-sm text-muted">Можно несколько</div>
          </div>
          <div className="grid gap-3">
            {visible.map((s) => (
              <button key={s.id} onClick={() => toggle(s.code)} className={`skill text-left ${picked.includes(s.code) ? 'ring-2 ring-[color:var(--accent)]' : ''}`}>
                <div className="text-lg font-semibold">{s.title}</div>
                <div className="text-sm text-muted">{s.level}</div>
              </button>
            ))}
          </div>
          <button className="btn w-full" disabled={picked.length===0} onClick={next}>Готово</button>
        </div>
      )}
    </div>
  );
}