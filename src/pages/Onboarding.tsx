import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function Onboarding() {
  const nav = useNavigate();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('courses').select('*').order('title');
      setCourses(data || []);
      setLoading(false);
    })();
  }, []);

  const enroll = async (code: string) => {
    // найдём курс и сделаем enrollment для текущего tg пользователя
    // (упрощённо: достанем нашего user.id по tg_id)
    const tgId = window?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!tgId) return;

    const { data: userRow } = await supabase.from('users').select('*').eq('tg_id', String(tgId)).single();
    const { data: courseRow } = await supabase.from('courses').select('*').eq('code', code).single();

    if (userRow && courseRow) {
      await supabase.from('enrollments').upsert({ user_id: userRow.id, course_id: courseRow.id });
      nav('/');
    }
  };

  if (loading) return <div className="p-5">Загрузка…</div>;

  return (
    <div className="min-h-screen p-5">
      <h1 className="text-2xl font-bold mb-4">Выбери направление</h1>
      <div className="grid gap-4">
        {courses.map((c) => (
          <button key={c.id} className="card text-left" onClick={() => enroll(c.code)}>
            <div className="text-lg font-semibold">{c.title}</div>
            <div className="text-sm text-[color:var(--muted)]">{c.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}