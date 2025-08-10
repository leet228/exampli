import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import SkillRoad from '../components/SkillRoad';

export default function Home(){
  const [tgUser, setTgUser] = useState<any>(null);
  const [items, setItems] = useState<{ id: string; title: string; subtitle?: string }[]>([]);

  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp; setTgUser(tg?.initDataUnsafe?.user || null);
  }, []);

  useEffect(() => { (async () => {
    const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!id) return;
    // берём первые 8 уроков из выбранных предметов
    const { data: rel } = await supabase.from('user_subjects').select('subject_id');
    const ids = (rel||[]).map((r:any)=>r.subject_id);
    if (ids.length === 0) { setItems([]); return; }
    const { data } = await supabase
      .from('lessons')
      .select('id, title, subject:subject_id(title, level)')
      .in('subject_id', ids)
      .order('order_index')
      .limit(8);
    const mapped = (data||[]).map((l:any)=>({ id: l.id, title: l.title, subtitle: l.subject?.title }));
    setItems(mapped);
  })(); }, []);

  const name = useMemo(()=> tgUser?.first_name || tgUser?.username || 'друг', [tgUser]);

  return (
    <>
      <div className="card mb-4">
        <div className="text-xl font-semibold mb-0.5">Привет, {name} 👋</div>
        <div className="text-sm text-muted">Выбирай урок на дороге ниже.</div>
      </div>
      {items.length === 0 ? (
        <div className="card">Курсы не выбраны. Нажми на бейдж с курсом сверху, чтобы выбрать.</div>
      ) : (
        <SkillRoad items={items} />
      )}
    </>
  );
}