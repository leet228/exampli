// src/pages/Home.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import SkillRoad from '../components/SkillRoad';
import TopicsButton from '../components/TopicsButton';
import TopicsPanel from '../components/panels/TopicsPanel';
import FloatingDecor from '../components/FloatingDecor';
import {
  apiUser,
  apiUserCourses,
  apiLessonsByCourse,
  type Course,
} from '../lib/api';

type RoadItem = { id: string; title: string; subtitle?: string };

const ACTIVE_ID_KEY = 'exampli:activeCourseId';

export default function Home() {
  // Telegram-пользователь (оставим для потенциального UI)
  const [tgUser] = useState<any>(
    () => (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user || null
  );

  // состояние страницы
  const [items, setItems] = useState<RoadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTopics, setOpenTopics] = useState(false);

  // активный курс
  const [activeId, setActiveId] = useState<number | null>(null);
  const [courseTitle, setCourseTitle] = useState<string>('');

  // тема декора под «дорогой»
  const decorTheme = useMemo<'math' | 'russian' | 'default'>(() => {
    const t = (courseTitle || '').toLowerCase();
    if (t.includes('математ')) return 'math';
    if (t.includes('русск')) return 'russian';
    return 'default';
  }, [courseTitle]);

  // ======== helpers: localStorage =========
  const readActiveFromStorage = useCallback((): number | null => {
    try {
      const v = localStorage.getItem(ACTIVE_ID_KEY);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  }, []);
  const writeActiveToStorage = useCallback((id: number) => {
    try {
      localStorage.setItem(ACTIVE_ID_KEY, String(id));
    } catch {}
  }, []);

  // ======== ensureActiveCourse: определяем активный курс (id + title) =========
  const ensureActiveCourse = useCallback(async (): Promise<{ id: number | null; title: string }> => {
    // 1) уже выбран в состоянии
    if (activeId) return { id: activeId, title: courseTitle };

    // 2) восстановим из localStorage
    const storedId = readActiveFromStorage();
    let list: Course[] = [];

    // подтянем список курсов пользователя (его часто ещё нужнее для title)
    try {
      list = await apiUserCourses();
    } catch {}

    const pickById = (id: number | null) => {
      if (!id || !list.length) return { id: null as number | null, title: '' };
      const found = list.find((c) => c.id === id) || null;
      return { id: found?.id ?? null, title: found?.title ?? '' };
    };

    if (storedId) {
      const p = pickById(storedId);
      if (p.id) {
        setActiveId(p.id);
        setCourseTitle(p.title);
        return p;
      }
    }

    // 3) users.current_course_id
    const u = await apiUser();
    if (u?.current_course_id) {
      const p = pickById(u.current_course_id);
      if (p.id) {
        setActiveId(p.id);
        setCourseTitle(p.title);
        writeActiveToStorage(p.id);
        return p;
      }
    }

    // 4) fallback: первый курс пользователя
    if (list.length) {
      const first = list[0];
      setActiveId(first.id);
      setCourseTitle(first.title);
      writeActiveToStorage(first.id);
      return { id: first.id, title: first.title };
    }

    return { id: null, title: '' };
  }, [activeId, courseTitle, readActiveFromStorage, writeActiveToStorage]);

  // ======== fetchLessons: грузим уроки по активному course_id =========
  const fetchLessons = useCallback(
    async (idArg?: number | null, titleArg?: string) => {
      const id = idArg ?? activeId;
      setLoading(true);
      try {
        if (!id) {
          setItems([]);
          return;
        }

        const lessons = await apiLessonsByCourse(id);
        const mapped: RoadItem[] = (lessons || []).slice(0, 12).map((l) => ({
          id: String(l.id),
          title: l.lesson, // поле из новой схемы
          subtitle: titleArg || courseTitle || '',
        }));

        setItems(mapped);
        if (!courseTitle && titleArg) setCourseTitle(titleArg);
      } finally {
        setLoading(false);
      }
    },
    [activeId, courseTitle]
  );

  // ======== первичная загрузка =========
  useEffect(() => {
    (async () => {
      const sel = await ensureActiveCourse();
      await fetchLessons(sel.id, sel.title);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ======== реакция на смену курса из других частей приложения =========
  useEffect(() => {
    const onChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ id?: number; title?: string; code?: string }>;
      const id = typeof e.detail?.id === 'number' ? e.detail.id : null;
      const title = e.detail?.title || '';

      if (id) {
        setActiveId(id);
        writeActiveToStorage(id);
        if (title) setCourseTitle(title);
        fetchLessons(id, title);
        return;
      }

      // на случай старых мест, где прилетает только title/code — попробуем найти курс по списку
      (async () => {
        const list = await apiUserCourses();
        const found = title ? list.find((c) => c.title === title) : null;
        if (found) {
          setActiveId(found.id);
          setCourseTitle(found.title);
          writeActiveToStorage(found.id);
          fetchLessons(found.id, found.title);
        }
      })();
    };

    window.addEventListener('exampli:courseChanged', onChanged as EventListener);
    return () => window.removeEventListener('exampli:courseChanged', onChanged as EventListener);
  }, [fetchLessons, writeActiveToStorage]);

  // ======== рендер =========
  return (
    <div className="overflow-x-hidden">
      {/* декор под дорогу */}
      <FloatingDecor theme={decorTheme} />

      {/* плавающая кнопка «Темы» и левая панель */}
      <TopicsButton onOpen={() => setOpenTopics(true)} />
      <TopicsPanel
        open={openTopics}
        onClose={() => setOpenTopics(false)}
      />

      {/* отступ, чтобы дорога не упиралась в кнопку тем */}
      <div style={{ height: 64 }} />

      {/* состояния */}
      {!activeId && !loading && (
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
