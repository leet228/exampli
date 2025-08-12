import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import SkillRoad from '../components/SkillRoad';
import TopicsButton from '../components/TopicsButton';
import TopicsPanel from '../components/panels/TopicsPanel';
import FloatingDecor from '../components/FloatingDecor';

type RoadItem = { id: string; title: string; subtitle?: string };

export default function Home() {
  const [tgUser, setTgUser] = useState<any>(null);
  const [items, setItems] = useState<RoadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTopics, setOpenTopics] = useState(false);
  const [courseTitle, setCourseTitle] = useState<string | undefined>(undefined);

  // какой декор показать за «дорогой»
  const decorTheme = useMemo<'math' | 'russian' | 'default'>(() => {
    const t = (courseTitle || '').toLowerCase();
    if (t.includes('математ')) return 'math';
    if (t.includes('русск')) return 'russian';
    return 'default';
  }, [courseTitle]);

  const fetchLessons = useCallback(async () => {
    try {
      setLoading(true);
      const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!id) { setItems([]); setLoading(false); return; }

      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('tg_id', String(id))
        .single();

      if (!user) { setItems([]); setLoading(false); return; }

      // выбранные предметы пользователя
      const { data: subs } = await supabase
        .from('user_subjects')
        .select('subject_id')
        .eq('user_id', user.id);

      const subjectIds = (subs || []).map((r: any) => r.subject_id);
      if (subjectIds.length === 0) { setItems([]); setLoading(false); return; }

      // берём первые 12 уроков по активным предметам
      const { data } = await supabase
        .from('lessons')
        .select('id, title, subject:subject_id(title, level)')
        .in('subject_id', subjectIds)
        .order('order_index', { ascending: true })
        .limit(12);

      const mapped: RoadItem[] = (data || []).map((l: any) => ({
        id: String(l.id),
        title: l.title,
        subtitle: l.subject?.title,
      }));

      setItems(mapped);

      // если курс не задан — возьмём подпись первого урока как текущий курс
      if (!courseTitle && Array.isArray(data) && data.length > 0) {
        const firstTitle = (data[0] as any)?.subject?.title as string | undefined;
        if (firstTitle) setCourseTitle(firstTitle);
      }
    } finally {
      setLoading(false);
    }
  }, [courseTitle]);

  // первичная загрузка и подписки на события
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    setTgUser(tg?.initDataUnsafe?.user || null);
    fetchLessons();

    // при смене курса где-либо в приложении
    const onChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ title?: string }>;
      if (e.detail?.title) setCourseTitle(e.detail.title);
      fetchLessons();
    };
    window.addEventListener('exampli:courseChanged', onChanged);

    // вернулись в приложение — освежим
    const onVisible = () => { if (!document.hidden) fetchLessons(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.removeEventListener('exampli:courseChanged', onChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchLessons]);

  const name = useMemo(() => tgUser?.first_name || tgUser?.username || 'друг', [tgUser]); // сейчас не используем, оставил на будущее

  return (
    <div className="overflow-x-hidden">
      {/* лёгкий «плавающий» фон под дорогу: цифры/буквы в зависимости от курса */}
      <FloatingDecor theme={decorTheme} />

      {/* плавающая большая розовая кнопка тем (приклеена под HUD) */}
      <TopicsButton onOpen={() => setOpenTopics(true)} />
      <TopicsPanel open={openTopics} onClose={() => setOpenTopics(false)} />

      {/* отступ, чтобы дорога не попадала под розовую кнопку */}
      <div style={{ height: 64 }} />

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
