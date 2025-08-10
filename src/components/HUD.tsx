import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import CourseSheet from './sheets/CourseSheet';
import StreakSheet from './sheets/StreakSheet';
import EnergySheet from './sheets/EnergySheet';

export default function HUD(){
  const [courseTitle, setCourseTitle] = useState<string>('Курс');
  const [streak, setStreak] = useState<number>(0);
  const [energy, setEnergy] = useState<number>(25); // показываем «энергию» вместо сердец

  const [open, setOpen] = useState<'course'|'streak'|'energy'|null>(null);

  useEffect(() => {
    (async () => {
      const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!id) return;
      const { data: user } = await supabase.from('users').select('*').eq('tg_id', String(id)).single();
      if (user) {
        setStreak(user.streak ?? 0);
        // energy: используем поле hearts как «энергию», масштаб 0..5 → 0..25 (по 5 единиц)
        const hearts = user.hearts ?? 5;
        setEnergy(hearts * 5);
      }
      // курс — берём первый из user_subjects
      const { data: rel } = await supabase.from('user_subjects').select('subject_id').limit(1);
      if (rel && rel[0]) {
        const { data: subj } = await supabase.from('subjects').select('*').eq('id', rel[0].subject_id).single();
        if (subj) setCourseTitle(subj.title);
      }
    })();
  }, []);

  return (
    <div className="sticky top-0 z-20 bg-[color:var(--bg)]/90 backdrop-blur border-b border-white/5">
      <div className="max-w-xl mx-auto px-5 py-2">
        <div className="flex items-center justify-between">
          {/* Курс */}
          <button onClick={() => setOpen('course')} className="badge">
            <span className="text-lg">🧩</span>
            <span className="truncate max-w-[160px]">{courseTitle}</span>
          </button>
          {/* Стрик и Энергия */}
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen('streak')} className="badge">🔥 {streak}</button>
            <button onClick={() => setOpen('energy')} className="badge">⚡ {energy}</button>
          </div>
        </div>
      </div>

      {/* Шторки */}
      <CourseSheet open={open==='course'} onClose={() => setOpen(null)} onPicked={(t)=> setCourseTitle(t)} />
      <StreakSheet open={open==='streak'} onClose={() => setOpen(null)} />
      <EnergySheet open={open==='energy'} onClose={() => setOpen(null)} />
    </div>
  );
}