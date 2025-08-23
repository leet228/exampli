// src/components/HUD.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import TopSheet from './sheets/TopSheet';
import AddCourseSheet from './panels/AddCourseSheet';
import AddCourseBlocking from './panels/AddCourseBlocking';
import { setUserSubjects } from '../lib/userState';
import CoursesPanel from './sheets/CourseSheet';
import CoinSheet from './sheets/CoinSheet';

type Subject = { id: number; code: string; title: string; level: string };

export default function HUD() {
  const anchorRef = useRef<HTMLDivElement>(null);

  const [courseTitle, setCourseTitle] = useState('Курс');
  const [streak, setStreak] = useState(0);
  const [energy, setEnergy] = useState(25);

  // коины и их шторка
  const [coins, setCoins] = useState(0);          // TODO: подставить из БД, если нужно
  const [coinsOpen, setCoinsOpen] = useState(false);

  // какая верхняя шторка открыта
  const [open, setOpen] = useState<'course' | 'streak' | 'energy' | null>(null);

  // нижняя шторка «Добавить курс»
  const [addOpen, setAddOpen] = useState(false);

  const loadUserSnapshot = useCallback(async () => {
    const tgId: number | undefined = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!tgId) return;

    const { data: user } = await supabase
      .from('users')
      .select('id, streak, hearts')
      .eq('tg_id', String(tgId))
      .single();

    if (user) {
      setStreak(user.streak ?? 0);
      setEnergy(((user.hearts ?? 5) as number) * 5);
      // если будет поле coins — раскомментируй:
      // setCoins(user.coins ?? 0);
    }

    if (user?.id) {
      const { data: rel } = await supabase
        .from('user_subjects')
        .select('subject_id, subjects(title)')
        .eq('user_id', user.id)
        .order('id', { ascending: true })
        .limit(1);

      const rows = (rel as Array<{ subjects?: { title?: string } }> | null) || [];
      const title = rows[0]?.subjects?.title;
      if (title) setCourseTitle(title);
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

  // последовательно: закрыть TopSheet → на следующий кадр открыть AddCourseSheet
  const openAddCourse = () => {
    setOpen(null);
    requestAnimationFrame(() => setAddOpen(true));
  };

  // подпинываем плавающие элементы (баннер) пересчитать позицию
  useEffect(() => {
    window.dispatchEvent(new Event('exampli:overlayToggled'));
  }, [addOpen, open, coinsOpen]);

  // Слушаем глобальное событие, чтобы открыть AddCourseSheet после онбординга
  useEffect(() => {
    const handler = () => {
      (window as any).__exampliAfterOnboarding = true;
      setAddOpen(true);
    };
    window.addEventListener('exampli:openAddCourse', handler);
    return () => window.removeEventListener('exampli:openAddCourse', handler);
  }, []);

  return (
    <>
      {/* Верхний HUD — фон как у всей страницы */}
      <div className="hud-fixed bg-[color:var(--bg)]">
        <div ref={anchorRef} className="max-w-xl mx-auto px-5 py-0">
          {/* 4 равные колонки: Курс — Стрик — Коины — Энергия */}
          <div className="grid grid-cols-4 items-center">
            {/* Курс (слева) */}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen('course'); }}
              className="flex items-center gap-2"
              aria-label="Выбрать курс"
            >
              <span className="text-lg">🧩</span>
              <span className="truncate max-w-[160px]">{courseTitle}</span>
            </button>

            {/* Стрик */}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen('streak'); }}
              className="justify-self-center flex items-center gap-0 text-sm text-[color:var(--muted)]"
              aria-label="Стрик"
            >
              <img src="/stickers/dead_fire.svg" alt="" aria-hidden className="w-9 h-9" />
              <span className="tabular-nums font-bold text-lg -ml-1 text-[color:var(--muted)]">{streak}</span>
            </button>

            {/* Коины (иконка + число справа) */}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCoinsOpen(true); }}
              className="justify-self-center flex items-center gap-1 text-sm text-[color:var(--muted)]"
              aria-label="Коины"
            >
              <img src="/stickers/coin_cat.svg" alt="" aria-hidden className="w-8 h-8" />
              <span className="tabular-nums font-bold text-lg text-yellow-400">{coins}</span>
            </button>

            {/* Энергия (справа) */}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen('energy'); }}
              className="justify-self-end flex items-center gap-1 text-sm text-[color:var(--muted)]"
              aria-label="Энергия"
            >
              <img src="/stickers/lightning.svg" alt="" aria-hidden className="w-8 h-8" />
              <span className="tabular-nums font-bold text-base text-white">{energy}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Верхние шторки */}
      <TopSheet open={open === 'course'} onClose={() => setOpen(null)} anchor={anchorRef} title="Курс">
        <CoursesPanel
          onPicked={async (s: Subject) => {
            await setUserSubjects([s.code]);
            setCourseTitle(s.title);
            window.dispatchEvent(new CustomEvent('exampli:courseChanged', { detail: { title: s.title, code: s.code } }));
            setOpen(null);
          }}
          onAddClick={openAddCourse}
        />
      </TopSheet>

      <TopSheet open={open === 'streak'} onClose={() => setOpen(null)} anchor={anchorRef} title="Стрик">
        <StreakSheetBody />
      </TopSheet>

      <TopSheet open={open === 'energy'} onClose={() => setOpen(null)} anchor={anchorRef} title="Энергия">
        <EnergySheetBody value={energy} onOpenSubscription={() => { setOpen(null); location.assign('/subscription'); }} />
      </TopSheet>

      {/* Фуллскрин «Кошелёк» (коины) */}
      <CoinSheet open={coinsOpen} onClose={() => setCoinsOpen(false)} />

      {/* Выбор курса: после онбординга — блокирующий полноэкранный; иначе — обычная шторка */}
      {((window as any).__exampliAfterOnboarding === true) ? (
        <AddCourseBlocking
          open={addOpen}
          onPicked={(s) => {
            void setUserSubjects([s.code]);
            setCourseTitle(s.title);
            window.dispatchEvent(new CustomEvent('exampli:courseChanged', { detail: { title: s.title, code: s.code } }));
            // users_onboarding удалён: ничего не обновляем
            (window as any).__exampliAfterOnboarding = false;
            setAddOpen(false);
          }}
        />
      ) : (
        <AddCourseSheet
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onAdded={(s) => {
            setCourseTitle(s.title);
            window.dispatchEvent(new CustomEvent('exampli:courseChanged', { detail: { title: s.title, code: s.code } }));
            setAddOpen(false);
          }}
        />
      )}
    </>
  );
}

/* ================== ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ================== */

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
        <button type="button" className="btn w-full" onClick={onOpenSubscription}>+ Пополнить / Оформить</button>
      </div>
    </>
  );
}