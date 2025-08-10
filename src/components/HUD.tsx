import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import TopSheet from './sheets/TopSheet';
import { setUserSubjects } from '../lib/userState';

type Subject = { id: string; code: string; title: string; level: string };

export default function HUD() {
  const anchorRef = useRef<HTMLDivElement>(null); // якорь для верхних шторок
  const [courseTitle, setCourseTitle] = useState('Курс');
  const [streak, setStreak] = useState(0);
  const [energy, setEnergy] = useState(25); // 0..25 (hearts * 5)
  const [open, setOpen] = useState<'course' | 'streak' | 'energy' | null>(null);

  const loadUserSnapshot = useCallback(async () => {
    const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!tgId) return;

    // базовые поля пользователя
    const { data: user } = await supabase
      .from('users')
      .select('id, streak, hearts')
      .eq('tg_id', String(tgId))
      .single();

    if (user) {
      setStreak(user.streak ?? 0);
      setEnergy(((user.hearts ?? 5) as number) * 5);
    }

    // текущий выбранный курс (берём первый в user_subjects для ЭТОГО пользователя)
    if (user?.id) {
      const { data: rel } = await supabase
        .from('user_subjects')
        .select('subject_id')
        .eq('user_id', user.id)
        .limit(1);

      const subjectId = rel?.[0]?.subject_id;
      if (subjectId) {
        const { data: subj } = await supabase
          .from('subjects')
          .select('title')
          .eq('id', subjectId)
          .single();
        if (subj?.title) setCourseTitle(subj.title);
      }
    }
  }, []);

  useEffect(() => {
    loadUserSnapshot();

    // если курс поменяли в другом месте — обновим HUD
    const onCourseChanged = () => loadUserSnapshot();
    window.addEventListener('exampli:courseChanged', onCourseChanged);

    // вернулись в приложение — освежим данные
    const onVisible = () => {
      if (!document.hidden) loadUserSnapshot();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.removeEventListener('exampli:courseChanged', onCourseChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadUserSnapshot]);

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
              🔥 {streak}
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
              ⚡ {energy}
            </button>
          </div>
        </div>
      </div>

      {/* ВЫПАДАЮЩИЕ ВНИЗ ШТОРКИ ИЗ HUD */}
      <TopSheet
        open={open === 'course'}
        onClose={() => setOpen(null)}
        anchor={anchorRef}
        title="Курс"
      >
        <CourseSheetBody
          onPicked={async (s) => {
            // сохраняем выбор курса и обновляем всё
            await setUserSubjects([s.code]);
            setCourseTitle(s.title);
            window.dispatchEvent(new CustomEvent('exampli:courseChanged'));
            setOpen(null);
          }}
        />
      </TopSheet>

      <TopSheet
        open={open === 'streak'}
        onClose={() => setOpen(null)}
        anchor={anchorRef}
        title="Стрик"
      >
        <StreakSheetBody />
      </TopSheet>

      <TopSheet
        open={open === 'energy'}
        onClose={() => setOpen(null)}
        anchor={anchorRef}
        title="Энергия"
      >
        <EnergySheetBody
          value={energy}
          onOpenSubscription={() => { setOpen(null); location.assign('/subscription'); }}
        />
      </TopSheet>
    </div>
  );
}

/* ===== ТЕЛА ШТОРОК (в одном файле для удобства) ===== */

function CourseSheetBody({
  onPicked,
}: {
  onPicked: (subject: Subject) => void;
}) {
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('subjects')
        .select('id, code, title, level')
        .order('title');
      setSubjects((data as Subject[]) || []);
    })();
  }, []);

  return (
    <div className="grid gap-3">
      {subjects.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onPicked(s)}
          className="flex items-center justify-between p-4 rounded-3xl bg-white/5 border border-white/10"
        >
          <div>
            <div className="font-semibold">{s.title}</div>
            <div className="text-xs text-muted">{s.level}</div>
          </div>
          <div className="text-2xl">📘</div>
        </button>
      ))}
      <button
        type="button"
        className="btn w-full"
        onClick={() => alert('Добавить курс — скоро')}
      >
        + Добавить курс
      </button>
    </div>
  );
}

function StreakSheetBody() {
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    (async () => {
      const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!id) return;
      const { data: u } = await supabase
        .from('users')
        .select('streak')
        .eq('tg_id', String(id))
        .single();
      setStreak(u?.streak ?? 0);
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
      <div className="progress"><div style={{ width: `${percent}%` }} /></div>
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