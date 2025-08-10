import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [tgUser, setTgUser] = useState<any>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

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
      const { data: subs } = await supabase
        .from('user_subjects')
        .select('subject_id')
        .eq('user_id', user.id);
      const ids = (subs || []).map((r: any) => r.subject_id);
      if (ids.length === 0) { setNeedsOnboarding(true); setLessons([]); return; }
      const { data } = await supabase
        .from('lessons')
        .select('*, subject:subject_id(title, level)')
        .in('subject_id', ids)
        .order('order_index');
      setLessons(data || []);
    })();
  }, []);

  const name = useMemo(() => tgUser?.first_name || tgUser?.username || 'друг', [tgUser]);

  return (
    <>
      <div className="card">
        <div className="text-xl font-semibold mb-0.5">Привет, {name} 👋</div>
        <div className="text-sm text-muted">Выбирай урок и поехали!</div>
      </div>

      {needsOnboarding && (
        <div className="card mt-4">
          <div className="mb-2 font-semibold">Похоже, предметы не выбраны</div>
          <button className="btn" onClick={() => location.assign('/onboarding')}>Выбрать курс</button>
        </div>
      )}

      {!needsOnboarding && (
        <div className="mt-4 grid gap-3">
          {lessons.map((l) => (
            <div key={l.id} className="skill">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{l.title}</div>
                  <div className="text-xs text-muted">{l.subject?.title}</div>
                </div>
                <button className="btn px-4 py-2" onClick={() => alert('Старт урока (заглушка).')}>Учиться</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}