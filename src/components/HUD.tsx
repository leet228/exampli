// src/components/HUD.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import TopSheet from './sheets/TopSheet';
import TopicsPanel from './panels/TopicsPanel';
import { setUserSubjects } from '../lib/userState';

type Subject = { id: number; code: string; title: string; level: string };

export default function HUD() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [courseTitle, setCourseTitle] = useState('Курс');
  const [streak, setStreak] = useState(0);
  const [energy, setEnergy] = useState(25); // 0..25 (hearts * 5)
  const [open, setOpen] = useState<'course' | 'streak' | 'energy' | null>(null);
  const [addOpen, setAddOpen] = useState(false); // нижняя шторка «Добавить курс»

  const loadUserSnapshot = useCallback(async () => {
    const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!tgId) return;

    // 1) базовые поля пользователя
    const { data: user } = await supabase
      .from('users')
      .select('id, streak, hearts')
      .eq('tg_id', String(tgId))
      .single();

    if (user) {
      setStreak(user.streak ?? 0);
      setEnergy(((user.hearts ?? 5) as number) * 5);
    }

    // 2) текущий курс: subject_id -> title
    if (user?.id) {
      const { data: rel } = await supabase
        .from('user_subjects')
        .select('subject_id')
        .eq('user_id', user.id)
        .limit(1);

      const subjectId = rel?.[0]?.subject_id as number | undefined;
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
    let alive = true;
    const refresh = async () => {
      if (!alive) return;
      await loadUserSnapshot();
    };

    refresh();

    const onCourseChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ title?: string; code?: string }>;
      if (e.detail?.title) setCourseTitle(e.detail.title);
      refresh();
    };
    const onVisible = () => { if (!document.hidden) refresh(); };

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
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen('course'); }}
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
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen('streak'); }}
              className="badge"
              aria-label="Стрик"
            >
              <img src="/stickers/fire.svg" alt="" aria-hidden className="w-4 h-4" />
              {streak}
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen('energy'); }}
              className="badge"
              aria-label="Энергия"
            >
              <img src="/stickers/lightning.svg" alt="" aria-hidden className="w-4 h-4" />
              {energy}
            </button>
          </div>
        </div>
      </div>

      {/* ШТОРКА: выбор курса (верхняя) */}
      <TopSheet
        open={open === 'course'}
        onClose={() => setOpen(null)}
        anchor={anchorRef}
        title="Курс"
      >
        <TopicsPanel
          onPicked={async (s: Subject) => {
            await setUserSubjects([s.code]);
            setCourseTitle(s.title);
            window.dispatchEvent(new CustomEvent('exampli:courseChanged', { detail: { title: s.title, code: s.code } }));
            setOpen(null);
          }}
          onAddClick={() => { setOpen(null); setAddOpen(true); }} // СНАЧАЛА закрыть верхнюю
        />
      </TopSheet>

      {/* ШТОРКА: стрик */}
      <TopSheet open={open === 'streak'} onClose={() => setOpen(null)} anchor={anchorRef} title="Стрик">
        <StreakSheetBody />
      </TopSheet>

      {/* ШТОРКА: энергия */}
      <TopSheet open={open === 'energy'} onClose={() => setOpen(null)} anchor={anchorRef} title="Энергия">
        <EnergySheetBody
          value={energy}
          onOpenSubscription={() => { setOpen(null); location.assign('/subscription'); }}
        />
      </TopSheet>

      {/* НИЖНЯЯ ШТОРКА: «Добавить курс» (без Cancel, с TG Back) */}
      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)}>
        <AddCourseBody
          onConfirm={async (subject) => {
            const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
            if (!tgId) return;

            const { data: user } = await supabase
              .from('users')
              .select('id')
              .eq('tg_id', String(tgId))
              .single();

            if (user?.id) {
              const { error } = await supabase
                .from('user_subjects')
                .upsert({ user_id: user.id, subject_id: subject.id }, { onConflict: 'user_id,subject_id' });
              if (error) {
                console.error('upsert user_subjects failed', error);
                return;
              }

              await setUserSubjects([subject.code]); // активируем
              setCourseTitle(subject.title);
              window.dispatchEvent(new CustomEvent('exampli:courseChanged', {
                detail: { title: subject.title, code: subject.code },
              }));
            }
            setAddOpen(false);
          }}
        />
      </BottomSheet>
    </div>
  );
}

/* ===================== ВНУТРЕННИЕ КОМПОНЕНТЫ ===================== */

function StreakSheetBody() {
  const [value, setValue] = useState(0);

  useEffect(() => {
    (async () => {
      const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
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

/* ---------- Простой BottomSheet с Telegram BackButton ---------- */
function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    if (!tg) return;
    if (open) {
      tg.BackButton?.show();
      const handler = () => onClose();
      tg.BackButton?.onClick?.(handler);
      return () => {
        tg.BackButton?.offClick?.(handler);
        tg.BackButton?.hide();
      };
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        className="sheet-panel px-4 pt-2 pb-[max(env(safe-area-inset-bottom),16px)]"
        style={{
          transform: 'translateY(0)',
          transition: 'transform 240ms ease',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        <div className="sheet-handle" />
        {children}
      </div>
    </>
  );
}

/* ---------- Тело «Добавить курс» (без Cancel) ---------- */
function AddCourseBody({
  onConfirm,
}: {
  onConfirm: (subject: Subject) => void;
}) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selected, setSelected] = useState<Subject | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('subjects')
        .select('id, code, title, level')
        .order('level', { ascending: true })
        .order('title', { ascending: true });
      setSubjects((data as Subject[]) || []);
    })();
  }, []);

  const groups = subjects.reduce<Record<string, Subject[]>>((acc, s) => {
    (acc[s.level] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div className="max-w-xl mx-auto">
      <div className="text-center text-sm text-muted mb-3">Выбери курс и нажми «Добавить»</div>

      {Object.entries(groups).map(([level, list]) => (
        <div key={level} className="mb-3">
          <div className="px-1 pb-2 text-xs uppercase tracking-wide text-muted">{level}</div>
          <div className="grid gap-2">
            {list.map((s) => {
              const active = selected?.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s)}
                  className={`flex items-center justify-between rounded-3xl px-4 py-3 border transition ${
                    active ? 'border-[color:var(--accent)] bg-white/10' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">📘</div>
                    <div className="text-left">
                      <div className="font-semibold">{s.title}</div>
                      <div className="text-xs text-muted">{s.level}</div>
                    </div>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border ${
                      active ? 'bg-[color:var(--accent)] border-[color:var(--accent)]' : 'border-white/20'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-4">
        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && onConfirm(selected)}
          className={`btn w-full ${!selected ? 'opacity-60 pointer-events-none' : ''}`}
        >
          Добавить
        </button>
      </div>
    </div>
  );
}
