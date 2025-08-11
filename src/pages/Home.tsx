import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import SkillRoad from '../components/SkillRoad';
import TopicsButton from '../components/TopicsButton';
import TopicsPanel from '../components/panels/TopicsPanel';

type RoadItem = { id: string; title: string; subtitle?: string };

export default function Home() {
  const [tgUser, setTgUser] = useState<any>(null);
  const [items, setItems] = useState<RoadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTopics, setOpenTopics] = useState(false);

  const fetchLessons = useCallback(async () => {
    try {
      setLoading(true);
      const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!id) { setItems([]); setLoading(false); return; }
      const { data: user } = await supabase.from('users').select('id').eq('tg_id', String(id)).single();
      if (!user) { setItems([]); setLoading(false); return; }
      const { data: subs } = await supabase.from('user_subjects').select('subject_id').eq('user_id', user.id);
      const subjectIds = (subs || []).map((r: any) => r.subject_id);
      if (subjectIds.length === 0) { setItems([]); setLoading(false); return; }
      const { data } = await supabase
        .from('lessons')
        .select('id, title, subject:subject_id(title, level)')
        .in('subject_id', subjectIds)
        .order('order_index', { ascending: true })
        .limit(12);
      setItems((data || []).map((l: any) => ({ id: l.id, title: l.title, subtitle: l.subject?.title })));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    setTgUser(tg?.initDataUnsafe?.user || null);
    fetchLessons();
    const onChanged = () => fetchLessons();
    window.addEventListener('exampli:courseChanged', onChanged);
    const onVisible = () => { if (!document.hidden) fetchLessons(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('exampli:courseChanged', onChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchLessons]);

  const name = useMemo(() => tgUser?.first_name || tgUser?.username || 'друг', [tgUser]);

  return (
    <div className="overflow-x-hidden">
      {/* плавающая кнопка выбора темы */}
      <TopicsButton onOpen={() => setOpenTopics(true)} />
      {/* панель тем */}
      <TopicsPanel open={openTopics} onClose={() => setOpenTopics(false)} />

      <div className="card mb-4 mt-12">
        <div className="text-xl font-semibold mb-0.5">Привет, {name} 👋</div>
        <div className="text-sm text-muted">Выбирай урок на дороге ниже.</div>
      </div>

      {loading ? (
        <div className="card">Загружаем уроки…</div>
      ) : items.length === 0 ? (
        <div className="card">Темы не выбраны. Нажми «🧩 Выбрать тему» сверху.</div>
      ) : (
        <SkillRoad items={items} />
      )}
    </div>
  );
}
