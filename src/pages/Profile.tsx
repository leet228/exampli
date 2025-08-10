import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Profile() {
  const [profile, setProfile] = useState<any>(null);
  const [enrolls, setEnrolls] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const tgId = window?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
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
    <div className="min-h-screen p-5">
      <h1 className="text-2xl font-bold mb-4">Профиль</h1>
      {!profile ? (
        <div>Нет данных профиля… Открой через Telegram.</div>
      ) : (
        <div className="space-y-4">
          <div className="card">
            <div className="text-lg font-semibold">@{profile.username || 'anon'}</div>
            <div className="text-sm text-[color:var(--muted)]">{profile.first_name} {profile.last_name || ''}</div>
          </div>
          <div className="card">
            <div className="font-semibold mb-2">Мои курсы</div>
            <div className="space-y-2">
              {enrolls.length === 0 && (
                <div className="text-sm text-[color:var(--muted)]">Пока нет. Зайди в «Начать курс».</div>
              )}
              {enrolls.map((e) => (
                <div key={e.course_id} className="flex items-center justify-between">
                  <div>{e.course?.title}</div>
                  <div className="text-sm text-[color:var(--muted)]">XP: {e.xp} · 🔥 {e.streak}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}