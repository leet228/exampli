import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import HUD from '../components/HUD';

export default function Profile() {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!tgId) return;
      const { data: userRow } = await supabase.from('users').select('*').eq('tg_id', String(tgId)).single();
      setProfile(userRow);
    })();
  }, []);

  return (
    <div className="min-h-screen pb-24">
      <HUD />
      <div className="max-w-xl mx-auto p-5 space-y-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">@{profile?.username || 'anon'}</div>
              <div className="text-sm text-muted">{profile?.first_name} {profile?.last_name || ''}</div>
            </div>
            <div className="text-4xl">🦉</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="card text-center"><div className="text-sm text-muted">XP</div><div className="text-xl font-bold">{profile?.xp ?? 0}</div></div>
          <div className="card text-center"><div className="text-sm text-muted">Стрик</div><div className="text-xl font-bold">{profile?.streak ?? 0}</div></div>
          <div className="card text-center"><div className="text-sm text-muted">Жизни</div><div className="text-xl font-bold">{profile?.hearts ?? 5}</div></div>
        </div>
      </div>
    </div>
  );
}