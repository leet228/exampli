import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';

export default function Profile() {
  const [profile, setProfile] = useState<any>(null);
  const [enrolls, setEnrolls] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!tgId) return;
      const { data: userRow } = await supabase.from('users').select('*').eq('tg_id', String(tgId)).single();
      setProfile(userRow);
      if (userRow) {
        const { data } = await supabase
          .from('enrollments')
          .select('*, course:course_id(*)')
          .eq('user_id', userRow.id);
        setEnrolls(data || []);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen pb-24 px-5 pt-5 max-w-xl mx-auto">
      <TopBar />
      {!profile ? (
        <div className="card">Нет данных профиля… Открой через Telegram.</div>
      ) : (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">@{profile.username || 'anon'}</div>
                <div className="text-sm text-muted">{profile.first_name} {profile.last_name || ''}</div>
              </div>
              <div className="text-4xl">🦉</div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="badge">🔥 Стрик: {profile.streak ?? 0}</span>
              <span className="badge">⭐ XP: {profile.xp ?? 0}</span>
            </div>
          </div>
          <div className="card">
            <div className="font-semibold mb-2">Мои курсы</div>
            <div className="space-y-3">
              {enrolls.length === 0 && (
                <div className="text-sm text-muted">Пока нет. Зайди в «Курсы».</div>
              )}
              {enrolls.map((e) => (
                <div key={e.course_id} className="flex items-center justify-between">
                  <div>{e.course?.title}</div>
                  <div className="text-sm text-muted">XP: {e.xp} · 🔥 {e.streak}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  );
}