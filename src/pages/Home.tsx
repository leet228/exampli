import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import SkillTrack, { Skill } from '../components/SkillTrack';
import HeroCard from '../components/HeroCard';

export default function Home() {
  const [tgUser, setTgUser] = useState<any>(null);
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    setTgUser(tg?.initDataUnsafe?.user || null);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: courses } = await supabase.from('courses').select('id, code');
      if (!courses || courses.length === 0) return;
      // Для красоты берём skills из первого курса ОГЭ рус, если есть
      const oge = courses.find(c => c.code === 'oge_rus') || courses[0];
      const { data } = await supabase
        .from('skills')
        .select('id, title, icon, color')
        .eq('course_id', oge.id)
        .order('order_index', { ascending: true });
      const mapped: Skill[] = (data || []).map((s, i) => ({
        id: s.id,
        title: s.title,
        icon: s.icon || '🧩',
        color: s.color || '#60a5fa',
        progress: (i+1) * 0.15 > 1 ? 1 : (i+1) * 0.15,
      }));
      setSkills(mapped);
    })();
  }, []);

  const name = useMemo(() => {
    if (!tgUser) return 'друг';
    return tgUser.first_name || tgUser.username || 'друг';
  }, [tgUser]);

  return (
    <div className="min-h-screen pb-24 px-5 pt-5 max-w-xl mx-auto">
      <TopBar />
      <HeroCard name={name} />
      <div className="mt-6">
        <div className="text-sm text-muted mb-2">Мои навыки</div>
        <SkillTrack skills={skills} />
      </div>
      <BottomNav />
    </div>
  );
}