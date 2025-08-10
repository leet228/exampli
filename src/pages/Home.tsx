import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import SkillRoad from '../components/SkillRoad';

type RoadItem = { id: string; title: string; subtitle?: string };

export default function Home() {
  const [tgUser, setTgUser] = useState<any>(null);
  const [items, setItems] = useState<RoadItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLessons = useCallback(async () => {
    try {
      setLoading(true);
      const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!id) { setItems([]); setLoading(false); return; }

      // текущий пользователь
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('tg_id', String(id))
        .single();

      if (!user) { setItems([]); setLoading(false); return; }

      // выбранные курсы ТОЛЬКО этого пользователя
      const { data: subs } = await supabase
        .from('user_subjects')
        .select('subject_id')
        .eq('user_id', user.id);

      const subjectIds = (subs || []).map((r: any) => r.subject_id);
      if (subjectIds.length === 0) { setItems([]); setLoading(false); return; }

      // уроки из выбранных курсов
      const { data } = await supabase
        .from('lessons')
        .select('id, title, subject:subject_id(title, level)')
        .in('subject_id', subjectIds)
        .order('order_index', { ascending: true })
        .limit(12);

      const mapped: RoadItem[] =
        (data || []).map((l: any) => ({ id: l.id, title: l.title, subtitle: l.subject?.title }));

      setItems(mapped);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    setTgUser(tg?.initDataUnsafe?.user || null);

    // первичная загрузка
    fetchLessons();

    // обновлять, когда меняем курс в шторке
    const onCourseChanged = () => fetchLessons();
    window.addEventListener('exampli:courseChanged', onCourseChanged);

    // и при возвращении в приложение
    const onVisible = () => { if (!document.hidden) fetchLessons(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.removeEventListener('exampli:courseChanged', onCourseChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchLessons]);

  const name = useMemo(() => tgUser?.first_name || tgUser?.username || 'друг', [tgUser]);

  return (
    <div className="overflow-x-hidden">
      <div className="card mb-4">
        <div className="text-xl font-semibold mb-0.5">Привет, {name} 👋</div>
        <div className="text-sm text-muted">Выбирай урок на дороге ниже.</div>
      </div>

      {loading ? (
        <div className="card">Загружаем уроки…</div>
      ) : items.length === 0 ? (
        <div className="card">
          Курсы не выбраны. Нажми на бейдж с курсом сверху, чтобы выбрать.
        </div>
      ) : (
        <SkillRoad items={items} />
      )}
    </div>
  );
}
