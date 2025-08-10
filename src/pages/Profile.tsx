import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Profile(){
  const [u, setU] = useState<any>(null);
  const [course, setCourse] = useState<string>('Курс');

  useEffect(()=>{ (async()=>{
    const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id; if (!id) return;
    const { data: user } = await supabase.from('users').select('*').eq('tg_id', String(id)).single();
    setU(user);
    const { data: rel } = await supabase.from('user_subjects').select('subject_id').limit(1);
    if (rel && rel[0]){ const { data: s } = await supabase.from('subjects').select('*').eq('id', rel[0].subject_id).single(); if (s) setCourse(s.title); }
  })(); },[]);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="text-xl font-semibold">{u?.first_name || u?.username || 'друг'}</div>
        <div className="text-sm text-muted">Курс: {course}</div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center"><div className="text-sm text-muted">🔥 Стрик</div><div className="text-xl font-bold">{u?.streak ?? 0}</div></div>
        <div className="card text-center"><div className="text-sm text-muted">⚡ Энергия</div><div className="text-xl font-bold">{(u?.hearts ?? 5)*5}</div></div>
        <div className="card text-center"><div className="text-sm text-muted">⭐ XP</div><div className="text-xl font-bold">{u?.xp ?? 0}</div></div>
      </div>
    </div>
  );
}