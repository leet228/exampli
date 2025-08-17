// src/components/HUD.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import TopSheet from './sheets/TopSheet';
import CourseSheet from './sheets/CourseSheet';
import AddCourseSheet from './panels/AddCourseSheet';
import { apiUser, apiUserCourses, type Course } from '../lib/api';

export default function HUD() {
  const anchorRef = useRef<HTMLDivElement>(null);

  const [courseTitle, setCourseTitle] = useState('Курс');
  const [streak, setStreak] = useState(0);
  const [energy, setEnergy] = useState(25);

  // какая шторка открыта (верхние)
  const [open, setOpen] = useState<'course' | 'streak' | 'energy' | null>(null);
  // нижняя шторка «Добавить курс»
  const [addOpen, setAddOpen] = useState(false);

  const loadUserSnapshot = useCallback(async () => {
    // 1) юзер: стрик + энергия
    const u = await apiUser();
    if (u) {
      setStreak(typeof u.streak === 'number' ? u.streak : 0);
      setEnergy(typeof u.energy === 'number' ? Math.max(0, Math.min(25, u.energy)) : 25);
    }

    // 2) заголовок курса
    const list = await apiUserCourses(); // курсы из users.added_courses_id
    const storedId = (() => {
      try {
        const v = localStorage.getItem('exampli:activeCourseId');
        return v ? Number(v) : null;
      } catch {
        return null;
      }
    })();
    const activeId = storedId ?? u?.current_course_id ?? (list[0]?.id ?? null);

    if (activeId && list.length) {
      const found = list.find((c) => c.id === activeId) || list[0];
      setCourseTitle(found.title);
    } else {
      setCourseTitle('Курс');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (alive) await loadUserSnapshot();
    };

    refresh();

    const onCourseChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ id?: number; title?: string; code?: string }>;
      if (e.detail?.title) setCourseTitle(e.detail.title);
      refresh();
    };

    const onVisible = () => {
      if (!document.hidden) refresh();
    };

    window.addEventListener('exampli:courseChanged', onCourseChanged as EventListener);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      window.removeEventListener('exampli:courseChanged', onCourseChanged as EventListener);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadUserSnapshot]);

  // подпинываем плавающие элементы (баннер) пересчитать позицию
  useEffect(() => {
    window.dispatchEvent(new Event('exampli:overlayToggled'));
  }, [open, addOpen]);

  return (
    <div className="hud-fixed bg-[color:var(--bg)]/90 backdrop-blur border-b border-white/5">
      <div ref={anchorRef} className="max-w-xl mx-auto px-5 py-2">
        <div className="flex items-center justify-between">
          {/* Курс */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen('course');
            }}
            className="badge"
            aria-label="Выбрать курс"
          >
            <span className="text-lg">🧩</span>
            <span className="truncate max-w-[180px]">{courseTitle}</span>
          </button>

          {/* Статусы */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen('streak');
              }}
              className="badge"
              aria-label="Стрик"
            >
              <img src="/stickers/fire.svg" alt="" aria-hidden className="w-4 h-4" />
              {streak}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen('energy');
              }}
              className="badge"
              aria-label="Энергия"
            >
              <img src="/stickers/lightning.svg" alt="" aria-hidden className="w-4 h-4" />
              {energy}
            </button>
          </div>
        </div>
      </div>

      {/* ВЕРХНЯЯ ШТОРКА: курсы (контент — CourseSheet) */}
      <TopSheet open={open === 'course'} onClose={() => setOpen(null)} anchor={anchorRef} title="Курсы">
        <CourseSheet
          onPicked={(title) => {
            setCourseTitle(title);
            setOpen(null);
          }}
          onAddClick={() => {
            // из CourseSheet открыть нижнюю «Добавить курс»
            setOpen(null);
            requestAnimationFrame(() => setAddOpen(true));
          }}
        />
      </TopSheet>

      {/* ВЕРХНЯЯ ШТОРКА: стрик */}
      <TopSheet open={open === 'streak'} onClose={() => setOpen(null)} anchor={anchorRef} title="Стрик">
        <StreakSheetBody />
      </TopSheet>

      {/* ВЕРХНЯЯ ШТОРКА: энергия */}
      <TopSheet open={open === 'energy'} onClose={() => setOpen(null)} anchor={anchorRef} title="Энергия">
        <EnergySheetBody
          value={energy}
          onOpenSubscription={() => {
            setOpen(null);
            location.assign('/subscription');
          }}
        />
      </TopSheet>

      {/* НИЖНЯЯ ШТОРКА: «Добавить курс» */}
      <AddCourseSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={(c: Course) => {
          setCourseTitle(c.title);
          try {
            localStorage.setItem('exampli:activeCourseId', String(c.id));
          } catch {}
          window.dispatchEvent(
            new CustomEvent('exampli:courseChanged', { detail: { id: c.id, title: c.title, code: c.code } })
          );
          setAddOpen(false);
        }}
      />
    </div>
  );
}

/* ================== ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ================== */

import { apiUser as apiUserForSheets } from '../lib/api';
import { useEffect as useEffect2, useState as useState2 } from 'react';

function StreakSheetBody() {
  const [streak, setStreak] = useState2(0);
  useEffect2(() => {
    (async () => {
      const u = await apiUserForSheets();
      setStreak(typeof u?.streak === 'number' ? u.streak : 0);
    })();
  }, []);
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  return (
    <>
      <div className="card">
        <div className="text-3xl font-bold">🔥 {streak}</div>
        <div className="text-sm text-muted">дней подряд</div>
      </div>
      <div className="grid grid-cols-7 gap-2 mt-4">
        {days.map((d) => (
          <div
            key={d}
            className={`h-9 rounded-xl flex items-center justify-center text-sm border ${
              d <= streak ? 'bg-white/10 border-white/10' : 'border-white/5'
            }`}
          >
            {d}
          </div>
        ))}
      </div>
    </>
  );
}

function EnergySheetBody({ value, onOpenSubscription }: { value: number; onOpenSubscription: () => void }) {
  const percent = Math.max(0, Math.min(100, Math.round((value / 25) * 100)));
  return (
    <>
      <div className="progress">
        <div style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 text-sm text-muted">{value}/25</div>
      <div className="grid gap-3 mt-5">
        <button type="button" className="card text-left" onClick={onOpenSubscription}>
          <div className="font-semibold">Безлимит (демо)</div>
          <div className="text-sm text-muted">Нажми, чтобы открыть «Абонемент»</div>
        </button>
        <button type="button" className="btn w-full" onClick={onOpenSubscription}>
          + Пополнить / Оформить
        </button>
      </div>
    </>
  );
}
