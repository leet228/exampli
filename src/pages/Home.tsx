import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import HUD from '../components/HUD';
import { canStartLesson } from '../lib/userState';

export default function Home() {
  const [tgUser, setTgUser] = useState<any>(null);
  const [lessons, setLessons] = useState<any[]>([]);

  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    setTgUser(tg?.initDataUnsafe?.user || null);
  }, []);

  useEffect(() => {
    (async () => {
      const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!id) return;
      const { data: user } = await supabase.from('users').select('*').eq('tg_id', String(id)).single();
      if (!user) return;
      const { data: subs } = await supabase.from('user_subjects').select('subject_id');
      const ids = (subs || []).map((r: any) => r.subject_id);
      if (ids.length === 0) return;
      const { data } = await supabase.from('lessons').select('*, subject:subject_id(title, level)').in('subject_id', ids).order('order_index');
      setLessons(data || []);
    })();
  }, []);

  const name = useMemo(() => tgUser?.first_name || tgUser?.username || 'друг', [tgUser]);

  const startEnabled = async () => await canStartLesson();

  return (
    <div className="min-h-screen pb-24">
      <HUD />
      <div className="max-w-xl mx-auto p-5">
        <div className="card">
          <div className="text-xl font-semibold mb-0.5">Привет, {name} 👋</div>
          <div className="text-sm text-muted">Выбирай урок и поехали!</div>
        </div>
        <div className="mt-4 grid gap-3">
          {lessons.map((l, i) => (
            <div key={l.id} className="skill">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{l.title}</div>
                  <div className="text-xs text-muted">{l.subject?.title}</div>
                </div>
                <button className="btn px-4 py-2" onClick={async () => {
                  if (!(await startEnabled())) return alert('Нет жизней. Подожди регенерацию.');
                  alert('Старт урока (заглушка).');
                }}>Учиться</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}