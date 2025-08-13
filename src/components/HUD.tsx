// src/components/HUD.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import TopSheet from './sheets/TopSheet';
import { setUserSubjects } from '../lib/userState';

type Subject = { id: number; code: string; title: string; level: string };

export default function HUD() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [courseTitle, setCourseTitle] = useState('Курс');
  const [streak, setStreak] = useState(0);
  const [energy, setEnergy] = useState(25); // 0..25 (hearts * 5)
  const [open, setOpen] = useState<'course' | 'streak' | 'energy' | null>(null);

  // полная панель «Добавить курс»
  const [addOpen, setAddOpen] = useState(false);

  const loadUserSnapshot = useCallback(async () => {
    const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!tgId) return;

    const { data: user } = await supabase
      .from('users')
      .select('id, streak, hearts')
      .eq('tg_id', String(tgId))
      .single();

    if (user) {
      setStreak(user.streak ?? 0);
      setEnergy(((user.hearts ?? 5) as number) * 5);
      // текущий выбранный предмет (берём первый в user_subjects) — и подтянем его title
      const { data: rel } = await supabase
        .from('user_subjects')
        .select('subject_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1);

      const subjectId = rel?.[0]?.subject_id;
      if (subjectId) {
        const { data: subj } = await supabase.from('subjects').select('title').eq('id', subjectId).single();
        if (subj?.title) setCourseTitle(subj.title);
      }
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const refresh = async () => { if (alive) await loadUserSnapshot(); };

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
          {/* Курс (кнопка открывает выбор курсов) */}
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

      {/* ШТОРКИ ИЗ HUD */}
      <TopSheet open={open === 'course'} onClose={() => setOpen(null)} anchor={anchorRef} title="Курсы">
        <CourseRack
          onPicked={async (s) => {
            await setUserSubjects([s.code]);      // активируем
            setCourseTitle(s.title);
            window.dispatchEvent(new CustomEvent('exampli:courseChanged', { detail: { title: s.title, code: s.code } }));
            setOpen(null);
          }}
          onAddClick={() => setAddOpen(true)}
        />
      </TopSheet>

      <TopSheet open={open === 'streak'} onClose={() => setOpen(null)} anchor={anchorRef} title="Стрик">
        <StreakSheetBody />
      </TopSheet>

      <TopSheet open={open === 'energy'} onClose={() => setOpen(null)} anchor={anchorRef} title="Энергия">
        <EnergySheetBody
          value={energy}
          onOpenSubscription={() => { setOpen(null); location.assign('/subscription'); }}
        />
      </TopSheet>

      {/* ПОЛНОЭКРАННАЯ ПАНЕЛЬ «ДОБАВИТЬ КУРС» */}
      <FullPanel open={addOpen} onClose={() => setAddOpen(false)} title="Курсы">
        <AddCourseBody
          onConfirm={async (subject) => {
            const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
            if (!tgId) return;

            const { data: user } = await supabase.from('users').select('id').eq('tg_id', String(tgId)).single();

            if (user?.id) {
              // добавляем связь user ↔ subject (если уже есть — тихо игнорируем)
              await supabase
                .from('user_subjects')
                .upsert(
                  { user_id: user.id, subject_id: subject.id },
                  { onConflict: 'user_id,subject_id', ignoreDuplicates: true }
                );
              // делаем активным
              await setUserSubjects([subject.code]);
              setCourseTitle(subject.title);
              window.dispatchEvent(new CustomEvent('exampli:courseChanged', {
                detail: { title: subject.title, code: subject.code },
              }));
            }
            setAddOpen(false);
          }}
        />
      </FullPanel>
    </div>
  );
}

/* ======================== ВНУТРЕННИЕ КОМПОНЕНТЫ ======================== */

function StreakSheetBody() {
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    (async () => {
      const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!id) return;
      const { data: u } = await supabase.from('users').select('streak').eq('tg_id', String(id)).single();
      setStreak(u?.streak ?? 0);
    })();
  }, []);
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  return (
    <>
      <div className="card"><div className="text-3xl font-bold">🔥 {streak}</div><div className="text-sm text-muted">дней подряд</div></div>
      <div className="grid grid-cols-7 gap-2 mt-4">
        {days.map((d) => (
          <div key={d} className={`h-9 rounded-xl flex items-center justify-center text-sm border ${d <= streak ? 'bg-white/10 border-white/10' : 'border-white/5'}`}>
            {d}
          </div>
        ))}
      </div>
    </>
  );
}

function EnergySheetBody({ value, onOpenSubscription }: { value: number; onOpenSubscription: () => void; }) {
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
        <button type="button" className="btn w-full" onClick={onOpenSubscription}>+ Пополнить / Оформить</button>
      </div>
    </>
  );
}

/* --- Сетка «квадратиков» курсов в шторке HUD --- */
function CourseRack({ onPicked, onAddClick }: { onPicked: (s: Subject) => void; onAddClick: () => void; }) {
  const [list, setList] = useState<Subject[]>([]);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // все предметы пользователя (для подсветки активного)
      const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      let userId: number | null = null;
      if (id) {
        const { data: user } = await supabase.from('users').select('id').eq('tg_id', String(id)).single();
        userId = user?.id ?? null;
        if (userId) {
          const { data: rel } = await supabase.from('user_subjects').select('subject_id').eq('user_id', userId).order('created_at');
          if (rel?.length) {
            const { data: subj } = await supabase.from('subjects').select('title').eq('id', rel[0].subject_id).single();
            setActiveTitle(subj?.title ?? null);
          }
        }
      }
      // доступные предметы (все)
      const { data } = await supabase.from('subjects').select('id,code,title,level').order('level').order('title');
      setList((data as Subject[]) || []);
    })();
  }, []);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {list.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onPicked(s)}
          className={`flex items-center gap-3 rounded-2xl px-3 py-3 border transition text-left
            ${activeTitle === s.title ? 'border-[color:var(--accent)] bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
        >
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-xl">📘</div>
          <div className="min-w-0">
            <div className="font-semibold truncate">{s.title}</div>
            <div className="text-xs text-muted">{s.level}</div>
          </div>
        </button>
      ))}

      {/* Плитка «+ добавить» */}
      <button
        type="button"
        onClick={onAddClick}
        className="flex items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5 hover:bg-white/10 transition px-3 py-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-xl">＋</div>
          <div className="font-semibold">Добавить курс</div>
        </div>
      </button>
    </div>
  );
}

/* --- Полноэкранная панель с Telegram Back --- */
function FullPanel({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; }) {
  // Telegram Back — закрывает панель, а не приложение
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    if (!tg) return;
    if (open) {
      tg.BackButton.show();
      const off = tg.BackButton.onClick?.(() => onClose());
      return () => {
        tg.BackButton.hide();
        // @ts-ignore
        off?.();
      };
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 top-0 bg-[color:var(--bg)] border-t border-white/10 flex flex-col
                   max-w-xl mx-auto rounded-t-[24px] overflow-hidden"
        style={{ transform: 'translateY(0)', transition: 'transform 260ms cubic-bezier(.2,.8,.2,1)' }}
      >
        <div className="px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-3 border-b border-white/10 text-center font-semibold">
          {title}
        </div>
        <div className="flex-1 overflow-auto px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          {children}
        </div>
      </div>
    </div>
  );
}

/* --- Тело панели «Добавить курс» --- */
function AddCourseBody({ onConfirm }: { onConfirm: (subject: Subject) => void; }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selected, setSelected] = useState<Subject | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('subjects').select('id, code, title, level').order('level').order('title');
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
        <div key={level} className="mb-4">
          <div className="px-1 pb-2 text-xs uppercase tracking-wide text-muted">{level}</div>
          <div className="grid gap-2">
            {list.map((s) => {
              const active = selected?.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s)}
                  className={`flex items-center justify-between rounded-3xl px-4 py-3 border transition
                  ${active ? 'border-[color:var(--accent)] bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-xl">📘</div>
                    <div className="text-left">
                      <div className="font-semibold">{s.title}</div>
                      <div className="text-xs text-muted">{s.level}</div>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border ${active ? 'bg-[color:var(--accent)] border-[color:var(--accent)]' : 'border-white/20'}`} />
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-6">
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
