// src/pages/Home.tsx
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { cacheGet, cacheSet, CACHE_KEYS } from '../lib/cache';
import SkillRoad from '../components/SkillRoad';
import TopicsButton from '../components/TopicsButton';
import TopicsPanel from '../components/panels/TopicsPanel';

type RoadItem = { id: string; title: string; subtitle?: string };

const ACTIVE_KEY = 'exampli:activeSubjectCode';

export default function Home() {
  // Telegram-пользователь (не обязателен, но оставим для потенциального UI)
  const [tgUser] = useState<any>(() => (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user || null);

  // состояние страницы
  const [items, setItems] = useState<RoadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTopics, setOpenTopics] = useState(false);

  // активный курс
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState<string>('');


  // ======== helpers: localStorage =========
  const readActiveFromStorage = useCallback((): string | null => {
    try { return localStorage.getItem(ACTIVE_KEY) || cacheGet<string>(CACHE_KEYS.activeCourseCode) || null; } catch { return null; }
  }, []);
  const writeActiveToStorage = useCallback((code: string) => {
    try { localStorage.setItem(ACTIVE_KEY, code); } catch {}
    cacheSet(CACHE_KEYS.activeCourseCode, code, 10 * 60_000);
  }, []);

  // ======== ensureActiveCourse: определяем активный курс (code + title) =========
  const ensureActiveCourse = useCallback(async (): Promise<{ code: string | null; title: string }> => {
    // 1) уже выбран в состоянии
    if (activeCode) return { code: activeCode, title: courseTitle };

    // 2) восстановим из localStorage
    const stored = readActiveFromStorage();
    if (stored) {
      const { data: subj } = await supabase
        .from('subjects')
        .select('id,title,code')
        .eq('code', stored)
        .single(); // если нет — вернёт error, data=null
      if (subj?.code) {
        setActiveCode(subj.code);
        setCourseTitle(subj.title || '');
        return { code: subj.code as string, title: (subj.title as string) || '' };
      }
    }

    // 3) возьмём выбранный курс пользователя из users.added_course
    const tgId: number | undefined = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!tgId) return { code: null, title: '' };

    const { data: user } = await supabase.from('users').select('id').eq('tg_id', String(tgId)).single();
    if (!user?.id) return { code: null, title: '' };

    const { data: u2 } = await supabase
      .from('users')
      .select('added_course')
      .eq('id', user.id)
      .single();
    const addedId = (u2 as any)?.added_course as number | null | undefined;
    let fCode: string | null = null;
    let fTitle = '';
    if (addedId) {
      const { data: subj } = await supabase
        .from('subjects')
        .select('title, code')
        .eq('id', addedId)
        .single();
      fCode = (subj?.code as string) ?? null;
      fTitle = (subj?.title as string) ?? '';
    }

    if (fCode) {
      setActiveCode(fCode);
      setCourseTitle(fTitle);
      writeActiveToStorage(fCode);
      return { code: fCode, title: fTitle };
    }

    return { code: null, title: '' };
  }, [activeCode, courseTitle, readActiveFromStorage, writeActiveToStorage]);

  // ======== fetchLessons: грузим уроки по активному subject (по коду) =========
  const fetchLessons = useCallback(async (codeArg?: string | null) => {
    const code = codeArg ?? activeCode;
    setLoading(true);
    try {
      if (!code) { setItems([]); return; }

      // найдём subject_id по коду
      const { data: subj } = await supabase
        .from('subjects')
        .select('id,title,code')
        .eq('code', code)
        .single();

      const subjectId = (subj?.id as number) || null;
      if (!subjectId) { setItems([]); return; }

      // первые 12 уроков ТОЛЬКО этого предмета
      const { data } = await supabase
        .from('lessons')
        .select('id,title')
        .eq('subject_id', subjectId)
        .order('order_index', { ascending: true })
        .limit(12);

      const mapped: RoadItem[] = (data as Array<{ id: number; title: string }> | null || []).map((l) => ({
        id: String(l.id),
        title: l.title,
        subtitle: (subj?.title as string) || '',
      }));

      setItems(mapped);
      if (code) cacheSet(CACHE_KEYS.lessonsByCode(code), data as any[], 5 * 60_000);
      if (!courseTitle && subj?.title) setCourseTitle(subj.title as string);
    } finally {
      setLoading(false);
    }
  }, [activeCode, courseTitle]);

  // ======== первичная загрузка =========
  useEffect(() => {
    (async () => {
      const sel = await ensureActiveCourse();
      await fetchLessons(sel.code);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ======== реакция на смену курса из других частей приложения =========
  useEffect(() => {
    const onChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ title?: string; code?: string }>;
      const code = e.detail?.code || null;
      const title = e.detail?.title || '';
      if (code) {
        setActiveCode(code);
        writeActiveToStorage(code);
      }
      if (title) setCourseTitle(title);
      fetchLessons(code);
    };
    window.addEventListener('exampli:courseChanged', onChanged as EventListener);
    return () => window.removeEventListener('exampli:courseChanged', onChanged as EventListener);
  }, [fetchLessons, writeActiveToStorage]);

  // ======== рендер =========
  return (
    <div className="overflow-x-hidden">
      {/* плавающая кнопка «Темы» и левая панель */}
      <TopicsButton onOpen={() => setOpenTopics(true)} />

      <TopicsPanel
        open={openTopics}
        onClose={() => setOpenTopics(false)}
      />

      {/* отступ, чтобы дорога не упиралась в кнопку тем */}
      <div style={{ height: 64 }} />

      {/* состояния */}
      {!activeCode && !loading && (
        <div className="card">
          Курсы не выбраны. Нажми «🧩 Выбрать тему» сверху и добавь курс.
        </div>
      )}

      {loading ? (
        <div className="card">Загружаем уроки…</div>
      ) : items.length === 0 ? (
        <div className="card">
          В этом курсе пока нет уроков. Выбери другой курс через «🧩 Выбрать тему».
        </div>
      ) : (
        <SkillRoad items={items} />
      )}
    </div>
  );
}