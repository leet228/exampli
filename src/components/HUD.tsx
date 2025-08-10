import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import TopSheet from './sheets/TopSheet';

export default function HUD(){
  const anchorRef = useRef<HTMLDivElement>(null);   // ЯКОРЬ
  const [courseTitle, setCourseTitle] = useState('Курс');
  const [streak, setStreak] = useState(0);
  const [energy, setEnergy] = useState(25);
  const [open, setOpen] = useState<'course'|'streak'|'energy'|null>(null);

  useEffect(() => {
    (async () => {
      const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!id) return;
      const { data: user } = await supabase.from('users').select('*').eq('tg_id', String(id)).single();
      if (user) { setStreak(user.streak ?? 0); setEnergy((user.hearts ?? 5) * 5); }
      const { data: rel } = await supabase.from('user_subjects').select('subject_id').limit(1);
      if (rel && rel[0]) {
        const { data: subj } = await supabase.from('subjects').select('*').eq('id', rel[0].subject_id).single();
        if (subj) setCourseTitle(subj.title);
      }
    })();
  }, []);

  return (
    <div className="sticky top-0 z-20 bg-[color:var(--bg)]/90 backdrop-blur border-b border-white/5">
      <div ref={anchorRef} className="max-w-xl mx-auto px-5 py-2">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setOpen('course')} className="badge">
            <span className="text-lg">🧩</span>
            <span className="truncate max-w-[160px]">{courseTitle}</span>
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setOpen('streak')} className="badge">🔥 {streak}</button>
            <button type="button" onClick={() => setOpen('energy')} className="badge">⚡ {energy}</button>
          </div>
        </div>
      </div>

      {/* ВЫПАДАЮЩИЕ ШТОРКИ ВНИЗ ИЗ HUD */}
      <TopSheet open={open==='course'} onClose={() => setOpen(null)} anchor={anchorRef} title="Курс">
        <CourseSheetBody onPicked={(t)=>{ setCourseTitle(t); setOpen(null); }} />
      </TopSheet>

      <TopSheet open={open==='streak'} onClose={() => setOpen(null)} anchor={anchorRef} title="Стрик">
        <StreakSheetBody />
      </TopSheet>

      <TopSheet open={open==='energy'} onClose={() => setOpen(null)} anchor={anchorRef} title="Энергия">
        <EnergySheetBody value={energy} />
      </TopSheet>
    </div>
  );
}

/* ---- содержимое «тел» шторок (можно оставить прежнюю логику) ---- */
function CourseSheetBody({ onPicked }: { onPicked: (title: string)=>void }) {
  const [subjects, setSubjects] = useState<any[]>([]);
  useEffect(()=>{ (async()=>{ const { data } = await supabase.from('subjects').select('*').order('title'); setSubjects(data||[]); })(); },[]);
  return (
    <div className="grid gap-3">
      {subjects.map(s => (
        <button key={s.id} onClick={()=>onPicked(s.title)}
          className="flex items-center justify-between p-4 rounded-3xl bg-white/5 border border-white/10">
          <div><div className="font-semibold">{s.title}</div><div className="text-xs text-muted">{s.level}</div></div>
          <div className="text-2xl">📘</div>
        </button>
      ))}
      <button className="btn w-full" onClick={()=>alert('Добавить курс — скоро')}>+ Добавить курс</button>
    </div>
  );
}

function StreakSheetBody() {
  const [streak, setStreak] = useState(0);
  useEffect(()=>{ (async()=>{ const id=(window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if(!id) return; const {data:u}=await supabase.from('users').select('streak').eq('tg_id',String(id)).single();
    setStreak(u?.streak??0); })(); },[]);
  const days = Array.from({length:30},(_,i)=>i+1);
  return (
    <>
      <div className="card"><div className="text-3xl font-bold">🔥 {streak}</div><div className="text-sm text-muted">дней подряд</div></div>
      <div className="grid grid-cols-7 gap-2 mt-4">
        {days.map(d => <div key={d} className={`h-9 rounded-xl flex items-center justify-center text-sm border ${d<=streak?'bg-white/10 border-white/10':'border-white/5'}`}>{d}</div>)}
      </div>
    </>
  );
}

function EnergySheetBody({ value }: { value: number }) {
  const percent = Math.round((value/25)*100);
  return (
    <>
      <div className="progress"><div style={{ width: `${percent}%` }} /></div>
      <div className="mt-2 text-sm text-muted">{value}/25</div>
      <div className="grid gap-3 mt-5">
        <button className="card text-left"><div className="font-semibold">Безлимит (демо)</div><div className="text-sm text-muted">Скоро</div></button>
        <button className="btn w-full" onClick={()=>alert('Пополнить — скоро')}>+ Пополнить</button>
      </div>
    </>
  );
}