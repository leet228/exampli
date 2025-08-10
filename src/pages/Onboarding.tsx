import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';

export default function Onboarding() {
  const nav = useNavigate();
  const [courses, setCourses] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('courses').select('*').order('title');
      setCourses(data || []);
    })();
  }, []);

  const enroll = async (code: string) => {
    const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!tgId) return alert('Открой через Telegram');
    const { data: userRow } = await supabase.from('users').select('*').eq('tg_id', String(tgId)).single();
    const { data: courseRow } = await supabase.from('courses').select('*').eq('code', code).single();
    if (userRow && courseRow) {
      await supabase.from('enrollments').upsert({ user_id: userRow.id, course_id: courseRow.id });
      nav('/');
    }
  };

  return (
    <div className="min-h-screen pb-24 px-5 pt-5 max-w-xl mx-auto">
      <TopBar />
      <div className="card">
        <div className="text-xl font-semibold">Выбери направление</div>
        <div className="text-sm text-muted">Можно поменять позже</div>
      </div>
      <div className="grid gap-4 mt-4">
        {courses.map((c, i) => (
          <button key={c.id} className="skill text-left fade-in" style={{animationDelay: `${i*60}ms`}} onClick={() => enroll(c.code)}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-lg">{c.title}</div>
                <div className="text-sm text-muted">{c.description}</div>
              </div>
              <div className="text-2xl select-none">📘</div>
            </div>
          </button>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}