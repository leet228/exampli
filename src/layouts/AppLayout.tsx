// src/pages/AppLayout.tsx
import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import HUD from '../components/HUD';
import BottomNav from '../components/BottomNav';
import Splash from '../components/Splash';
import type { BootData } from '../lib/boot';
import Onboarding from '../components/Onboarding';
import AddCourseBlocking from '../components/panels/AddCourseBlocking';
import { setUserSubjects, syncEnergy } from '../lib/userState';
import { supabase } from '../lib/supabase';
import SpeedInsights from '../lib/SpeedInsights';
async function pingPresence(route: string, event: string) {
  try {
    const boot: any = (window as any).__exampliBoot;
    const userId = boot?.user?.id || null;
    if (!userId) return;
    await fetch('/api/presence', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, route, event })
    });
  } catch {}
}
import TopicsPanel from '../components/panels/TopicsPanel';
import AddCourseSheet from '../components/panels/AddCourseSheet';
import { sfx } from '../lib/sfx';

const BOTTOM_NAV_ROUTES = new Set(['/', '/quests', '/battle', '/ai', '/subscription', '/profile']);


export default function AppLayout() {
  const { pathname } = useLocation();

  // HUD всегда смонтирован, но скрывается вне «Дороги»
  const showBottom = BOTTOM_NAV_ROUTES.has(pathname);
  const isAI = pathname === '/ai';

  const [bootReady, setBootReady] = useState(false); // данные загружены и кэшированы
  const [uiWarmed, setUiWarmed] = useState(false);   // профиль смонтирован
  const [bootData, setBootData] = useState<BootData | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [openCoursePicker, setOpenCoursePicker] = useState<boolean>(false);
  const [prewarmACDone, setPrewarmACDone] = useState(false);
  const bootDone = bootReady && uiWarmed;

  // Во время онбординга полностью глушим звуки, чтобы пользователь не слышал SFX поверх модального сценария
  useEffect(() => {
    try { sfx.setGlobalMuted(showOnboarding); } catch {}
    return () => {
      if (showOnboarding) {
        try { sfx.setGlobalMuted(false); } catch {}
      }
    };
  }, [showOnboarding]);

  // Снимаем телеграмовский лоадер сразу при монтировании
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    try {
      tg?.ready();
      tg?.expand?.();
      tg?.BackButton?.hide?.();
    } catch {}
    // fail-safe: если вдруг ready() не сработал — повторим через 1с
    const t = setTimeout(() => {
      try { tg?.ready(); tg?.expand?.(); } catch {}
    }, 1000);
    return () => clearTimeout(t);
  }, []);

  // Разблокируем аудио по первому пользовательскому вводу
  useEffect(() => {
    const onDown = () => { try { sfx.unlock(); } catch {} };
    try { window.addEventListener('pointerdown', onDown as any, { once: true } as any); } catch { window.addEventListener('pointerdown', onDown as any); }
    return () => { try { window.removeEventListener('pointerdown', onDown as any); } catch {} };
  }, []);

  // слушаем глобальное событие из bootPreload (дубликат защиты)
  useEffect(() => {
    const ready = (e: Event) => {
      const ce = e as CustomEvent<BootData>;
      setBootData(ce.detail);
      setBootReady(true);
      // Проверяем телефон из users, а если пуст — берём из userProfile (чтобы не зависеть от рассинхрона)
      const userHasPhone = Boolean((ce.detail?.user as any)?.phone_number || ce.detail?.userProfile?.phone_number);
      const userHasCourse = !!(ce.detail?.user as any)?.added_course;
      if (!userHasPhone) {
        setOpenCoursePicker(false);
        setShowOnboarding(true);
      } else if (!userHasCourse) {
        setShowOnboarding(false);
        setOpenCoursePicker(true);
      } else {
        setShowOnboarding(false);
        setOpenCoursePicker(false);
      }
    };
    window.addEventListener('exampli:bootData', ready as EventListener);
    const reboot = () => { setBootReady(false); setUiWarmed(false); };
    window.addEventListener('exampli:reboot', reboot as EventListener);
    return () => window.removeEventListener('exampli:bootData', ready as EventListener);
  }, []);

  // Автоматическая прокрутка вверх при переключении между страницами bottom nav
  useEffect(() => {
    if (!showBottom) return;
    // Небольшая задержка, чтобы страница успела отрендериться
    const timeoutId = setTimeout(() => {
      try {
        // Прокручиваем все .main-scroll контейнеры
        const scrollContainers = document.querySelectorAll('.main-scroll');
        scrollContainers.forEach((container) => {
          if (container instanceof HTMLElement) {
            container.scrollTop = 0;
          }
        });
        // Также прокручиваем window и document
        window.scrollTo({ top: 0, behavior: 'instant' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      } catch {}
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [pathname, showBottom]);

  // После ухода сплэша подсказать оверлеям пересчитать позицию
  useEffect(() => {
    if (bootDone) {
      // После скрытия сплэша — подавим любые звуки на короткое время,
      // чтобы исключить задержки/рандомные срабатывания во время первой отрисовки.
      try { sfx.suppressFor(5000); } catch {}
      window.dispatchEvent(new Event('exampli:overlayToggled'));
      // Фоновый прогрев для мгновенных панелей: если есть список всех предметов — прогреем ещё 1-2 помимо активного
      try {
        const boot = (window as any).__exampliBoot as BootData | null;
        const activeCode = localStorage.getItem('exampli:active_course_code');
        const active = (boot?.subjects || []).find((s) => s.code === activeCode);
        const rest = (boot?.subjectsAll || []).filter((s) => s.id !== active?.id).slice(0, 2);
        // прогреем темы для пары курсов в фоне
        import('../lib/boot').then((m) => {
          rest.forEach((s) => { try { m.precacheTopicsForSubject(s.id); } catch {} });
        });
      } catch {}
    }
  }, [bootDone]);

  // как только данные готовы и профиль будет смонтирован, подтверждаем прогрев UI
  useEffect(() => {
    if (bootReady) {
      // дождёмся коммита DOM
      requestAnimationFrame(() => { setUiWarmed(true); });
    }
  }, [bootReady]);

  // Presence ping на смену маршрута (с TTL 5 минут на сервере)
  useEffect(() => {
    try { pingPresence(pathname || '/', 'route'); } catch {}
  }, [pathname]);

  // После bootReady один раз прогреваем AddCourseSheet: монтируем и затем полностью размонтируем
  useEffect(() => {
    if (bootReady && !prewarmACDone) {
      // даём кадр на монтирование, затем отмечаем как завершённый прогрев (размонтируем)
      const id = requestAnimationFrame(() => setPrewarmACDone(true));
      return () => cancelAnimationFrame(id);
    }
  }, [bootReady, prewarmACDone]);

  // Предпрогреваем энергию/таймеры под сплэшем
  useEffect(() => {
    if (!bootReady) return;
    (async () => { try { await syncEnergy(0); } catch {} })();
  }, [bootReady]);

  return (
    <div className={`min-h-screen ${isAI ? '' : 'safe-top'} safe-bottom main-scroll`}>
      {/* Сплэш поверх всего до загрузки */}
      {!bootDone && (
        <Splash
          onReady={(data) => {
            setBootData(data);
            setBootReady(true);
          }}
        />
      )}

      {/* Прогрев TopicsPanel после готовности данных, но до скрытия сплэша */}
      {bootReady && !bootDone && (
        <div className="prewarm-mount" aria-hidden="true">
          <TopicsPanel open onClose={() => {}} />
        </div>
      )}

      {/* Прогрев BottomNav (невидимый), HUD монтируется постоянно ниже */}
      {bootReady && !bootDone && (
        <div className="prewarm-mount" aria-hidden="true">
          <BottomNav />
        </div>
      )}

      {/* Убрали прогрев FriendsPanel/AddFriendsPanel, данные для них прогреваются через boot2 в фоне */}

      {/* Постоянный прогрев AddCourseSheet (без сайд‑эффектов и в отдельном руте) */}
      {bootReady && (
        <>
          {/* Прогрев: один раз монтируем AddCourseSheet открытым (невидимо), затем размонтируем */}
          {!prewarmACDone && <div id="prewarm-ac" className="prewarm-mount" aria-hidden="true" />}
          {!prewarmACDone && (
            <AddCourseSheet
              open
              onClose={() => {/* noop */}}
              onAdded={() => {/* noop */}}
              useTelegramBack={false}
              initialOpenLevels={["OGE", "EGE"]}
            />
          )}

          {/* Боевой контейнер: всегда присутствует и не скрыт, чтобы портал HUD был виден */}
          <div id="addcourse-root" />
        </>
      )}

      {/* Верхний HUD: всегда смонтирован (даже под сплэшем), скрывается вне домашней без размонтирования */}
      <div style={{ display: pathname === '/' ? 'block' : 'none' }}>
        <HUD />
      </div>

      <div id="app-container" className={isAI ? 'w-full' : 'max-w-xl mx-auto p-5'}>
        {bootReady && <Outlet context={{ bootData }} />}
      </div>

      {/* Onboarding поверх после boot */}
      {bootDone && (
        <Onboarding
          open={showOnboarding}
          onDone={() => {
            setShowOnboarding(false);
            setOpenCoursePicker(true);
          }}
        />
      )}

      {/* Выбор курса сверху уровня Layout, если нужно без HUD */}
      <AddCourseBlocking
        open={openCoursePicker}
        onPicked={async (s) => {
          await setUserSubjects([s.code]);
          setOpenCoursePicker(false);
          // оповестим остальных
          window.dispatchEvent(new CustomEvent('exampli:courseChanged', { detail: { title: s.title, code: s.code } } as any));
          // перезапустим Splash/boot для повторной прогрузки и кэширования
          setBootReady(false);
          setUiWarmed(false);
        }}
      />

      {/* Нижняя навигация (после загрузки, чтобы не мигала под сплэшем) */}
      {showBottom && bootDone && <BottomNav />}

      {/* Vercel Speed Insights */}
      <SpeedInsights />
    </div>
  );
}