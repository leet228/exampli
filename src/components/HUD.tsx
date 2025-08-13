// src/components/HUD.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import TopSheet from './sheets/TopSheet';
import { setUserSubjects } from '../lib/userState';

type ID = number | string;
type Subject = { id: ID; code: string; title: string; level: string };

// маленький помощник
const tgUserId = () =>
  (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id as number | undefined;

export default function HUD() {
  const anchorRef = useRef<HTMLDivElement>(null); // якорь для шторок
  const [courseTitle, setCourseTitle] = useState<string>('Курс');
  const [streak, setStreak] = useState<number>(0);
  const [energy, setEnergy] = useState<number>(25); // 0..25 (hearts * 5)
  const [open, setOpen] = useState<'course' | 'streak' | 'energy' | null>(null);

  /** тянем снэпшот пользователя + текущий курс */
  const loadUserSnapshot = useCallback(async () => {
    const tgId = tgUserId();
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

    // текущий выбранный курс (берём первый из user_subjects для ЭТОГО пользователя)
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

  /** жизненный цикл + события */
  useEffect(() => {
    let alive = true;

    const refresh = async () => {
      if (!alive) return;
      await loadUserSnapshot();
    };

    // первичная загрузка
    refresh();

    // смена курса из шторки/панели
    const onCourseChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ title?: string; code?: string }>;
      if (e.detail?.title) setCourseTitle(e.detail.title); // мгновенно обновляем бейдж
      refresh();
    };

    // вернулся в приложение — освежим
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

  return (
    <div className="hud-fixed bg-[color:var(--bg)]/90 backdrop-blur border-b border-white/5">
      <div ref={anchorRef} className="max-w-xl mx-auto px-5 py-2">
        <div className="flex items-center justify-between">
          {/* Бейдж курса */}
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

          {/* Статусы (иконки из /public/stickers) */}
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

      {/* Шторка: выбор курса */}
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
            window.dispatchEvent(new CustomEvent('exampli:courseChanged', { detail: { title: s.title, code: s.code } }));
            setOpen(null);
          }}
        />
      </TopSheet>

      {/* Шторка: стрик */}
      <TopSheet
        open={open === 'streak'}
        onClose={() => setOpen(null)}
        anchor={anchorRef}
        title="Стрик"
      >
        <StreakSheetBody />
      </TopSheet>

      {/* Шторка: энергия */}
      <TopSheet
        open={open === 'energy'}
        onClose={() => setOpen(null)}
        anchor={anchorRef}
        title="Энергия"
      >
        <EnergySheetBody
          value={energy}
          onOpenSubscription={() => {
            setOpen(null);
            // переходим в «Абонемент»
            location.assign('/subscription');
          }}
        />
      </TopSheet>
    </div>
  );
}

/* ---------------- ТЕЛА ШТОРОК ---------------- */

function CourseSheetBody({ onPicked }: { onPicked: (subject: Subject) => void }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('subjects')
        .select('id, code, title, level')
        .order('title');
      setSubjects(((data as Subject[]) ?? []).filter(Boolean));
    })();
  }, []);

  return (
    <div className="grid gap-3">
      {subjects.map((s) => (
        <button
          key={String(s.id)}
          type="button"
          onClick={() => onPicked(s)}
          className="flex items-center justify-between p-4 rounded-3xl bg-white/5 border border-white/10 hover:border-white/20 transition"
        >
          <div>
            <div className="font-semibold">{s.title}</div>
            <div className="text-xs text-muted">{s.level}</div>
          </div>
          <div className="text-2xl">📘</div>
        </button>
      ))}
      <button type="button" className="btn w-full" onClick={() => alert('Добавить курс — скоро')}>
        + Добавить курс
      </button>
    </div>
  );
}

function StreakSheetBody() {
  const [value, setValue] = useState<number>(0);

  useEffect(() => {
    (async () => {
      const id = tgUserId();
      if (!id) return;
      const { data } = await supabase.from('users').select('streak').eq('tg_id', String(id)).single();
      setValue(data?.streak ?? 0);
    })();
  }, []);

  const days = Array.from({ length: 30 }, (_, i) => i + 1);

  return (
    <>
      <div className="card flex items-center gap-3">
        <img src="/stickers/fire.svg" alt="" aria-hidden className="w-6 h-6" />
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm text-muted -mt-0.5">дней подряд</div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 mt-4">
        {days.map((d) => (
          <div
            key={d}
            className={`h-9 rounded-xl flex items-center justify-center text-sm border ${
              d <= value ? 'bg-white/10 border-white/10' : 'border-white/5'
            }`}
          >
            {d}
          </div>
        ))}
      </div>
    </>
  );
}

function EnergySheetBody({
  value,
  onOpenSubscription,
}: {
  value: number;
  onOpenSubscription: () => void;
}) {
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
