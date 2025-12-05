// src/pages/AppLayout.tsx
import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import HUD from '../components/HUD';
import BottomNav from '../components/BottomNav';
import Splash from '../components/Splash';
import type { BootData } from '../lib/boot';
import Onboarding from '../components/Onboarding';
import AddCourseBlocking from '../components/panels/AddCourseBlocking';
import { setUserSubjects, syncEnergy } from '../lib/userState';
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
import Profile from '../pages/Profile';
import Home from '../pages/Home';
import AI from '../pages/AI';
import Battle from '../pages/Battle';
import Quests from '../pages/Quests';
import Subscription from '../pages/Subscription';
import TopicsPanel from '../components/panels/TopicsPanel';
import AddCourseSheet from '../components/panels/AddCourseSheet';
import { sfx } from '../lib/sfx';

const BOTTOM_NAV_ROUTES = new Set(['/', '/quests', '/battle', '/ai', '/subscription', '/profile']);


export default function AppLayout() {
  const { pathname } = useLocation();

  // HUD всегда смонтирован, но скрывается вне «Дороги»
  // нижняя навигация на этих маршрутах
  const showBottom = BOTTOM_NAV_ROUTES.has(pathname);
  const isAI = pathname === '/ai';

  const [bootReady, setBootReady] = useState(false); // данные загружены и кэшированы
  const [uiWarmed, setUiWarmed] = useState(false);   // профиль смонтирован
  const [bootData, setBootData] = useState<BootData | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [openCoursePicker, setOpenCoursePicker] = useState<boolean>(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const homeRef = useRef<HTMLDivElement | null>(null);
  const aiRef = useRef<HTMLDivElement | null>(null);
  const battleRef = useRef<HTMLDivElement | null>(null);
  const questsRef = useRef<HTMLDivElement | null>(null);
  const subsRef = useRef<HTMLDivElement | null>(null);
  const addCourseRootRef = useRef<HTMLDivElement | null>(null);
  const [prewarmACDone, setPrewarmACDone] = useState(false);
  const bootDone = bootReady && uiWarmed;
  const prevVisibleRouteRef = useRef<string | null>(null);

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
    if (showBottom) {
      // Небольшая задержка, чтобы страница успела отрендериться
      const timeoutId = setTimeout(() => {
        try {
          // Прокручиваем все .main-scroll контейнеры (для Home, AI и других страниц)
          const scrollContainers = document.querySelectorAll('.main-scroll');
          scrollContainers.forEach((container) => {
            if (container instanceof HTMLElement) {
              container.scrollTop = 0;
            }
          });
          // Прокручиваем контейнеры страниц через ref'ы
          [homeRef, profileRef, aiRef, battleRef, questsRef, subsRef].forEach((ref) => {
            if (ref.current) {
              const el = ref.current as HTMLElement;
              el.scrollTop = 0;
              // Также ищем скролл-контейнеры внутри
              const innerScroll = el.querySelector('.main-scroll') as HTMLElement;
              if (innerScroll) innerScroll.scrollTop = 0;
            }
          });
          // Также прокручиваем window и document (для Profile и других страниц без .main-scroll)
          window.scrollTo({ top: 0, behavior: 'instant' });
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        } catch {}
      }, 0);
      return () => clearTimeout(timeoutId);
    }
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

  // Управляем inert у постоянных контейнеров страниц: активной странице снимаем inert, скрытым — ставим inert
  useEffect(() => {
    const map: Array<[string, React.RefObject<HTMLDivElement>]> = [
      ['/', homeRef],
      ['/ai', aiRef],
      ['/battle', battleRef],
      ['/quests', questsRef],
      ['/subscription', subsRef],
      ['/profile', profileRef],
    ];
    map.forEach(([path, ref]) => {
      const el = ref.current;
      const hidden = pathname !== path;
      try { if (hidden) el?.setAttribute('inert', ''); else el?.removeAttribute('inert'); } catch {}
    });
  }, [pathname]);

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

  // Глобальные события видимости страниц, чтобы вложенные компоненты могли ставить на паузу анимации/таймеры
  useEffect(() => {
    if (!bootReady) return;
    const currentRoute = pathname || '/';
    const prev = prevVisibleRouteRef.current;
    if (prev && prev !== currentRoute) {
      try {
        window.dispatchEvent(new CustomEvent('exampli:pageVisibility', { detail: { path: prev, visible: false } } as any));
      } catch {}
    }
    try {
      window.dispatchEvent(new CustomEvent('exampli:pageVisibility', { detail: { path: currentRoute, visible: true } } as any));
    } catch {}
    try { document.body?.setAttribute('data-active-route', currentRoute); } catch {}
    prevVisibleRouteRef.current = currentRoute;
  }, [pathname, bootReady]);

  useEffect(() => () => {
    const last = prevVisibleRouteRef.current;
    if (last) {
      try { window.dispatchEvent(new CustomEvent('exampli:pageVisibility', { detail: { path: last, visible: false } } as any)); } catch {}
    }
  }, []);

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
          <div ref={addCourseRootRef} id="addcourse-root" />
        </>
      )}

      {/* Верхний HUD: всегда смонтирован (даже под сплэшем), скрывается вне домашней без размонтирования */}
      <div style={{ display: pathname === '/' ? 'block' : 'none' }}>
        <HUD />
      </div>

      <div id="app-container" className={isAI ? 'w-full' : 'max-w-xl mx-auto p-5'}>
        {bootReady && (
          <>
            {/* Home */}
            <div
              ref={homeRef}
              data-page-route="/"
              data-page-visible={pathname === '/' ? '1' : '0'}
              className={pathname === '/' ? '' : 'prewarm-mount'}
              aria-hidden={pathname === '/' ? undefined : true}
            >
              <Home />
            </div>
            {/* AI */}
            <div
              ref={aiRef}
              data-page-route="/ai"
              data-page-visible={pathname === '/ai' ? '1' : '0'}
              className={pathname === '/ai' ? '' : 'prewarm-mount'}
              aria-hidden={pathname === '/ai' ? undefined : true}
            >
              <AI />
            </div>
            {/* Battle */}
            <div
              ref={battleRef}
              data-page-route="/battle"
              data-page-visible={pathname === '/battle' ? '1' : '0'}
              className={pathname === '/battle' ? '' : 'prewarm-mount'}
              aria-hidden={pathname === '/battle' ? undefined : true}
            >
              <Battle />
            </div>
            {/* Quests */}
            <div
              ref={questsRef}
              data-page-route="/quests"
              data-page-visible={pathname === '/quests' ? '1' : '0'}
              className={pathname === '/quests' ? '' : 'prewarm-mount'}
              aria-hidden={pathname === '/quests' ? undefined : true}
            >
              <Quests />
            </div>
            {/* Subscription */}
            <div
              ref={subsRef}
              data-page-route="/subscription"
              data-page-visible={pathname === '/subscription' ? '1' : '0'}
              className={pathname === '/subscription' ? '' : 'prewarm-mount'}
              aria-hidden={pathname === '/subscription' ? undefined : true}
            >
              <Subscription />
            </div>
            {/* Profile */}
            <div
              ref={profileRef}
              data-page-route="/profile"
              data-page-visible={pathname === '/profile' ? '1' : '0'}
              className={pathname === '/profile' ? '' : 'prewarm-mount'}
              aria-hidden={pathname === '/profile' ? undefined : true}
            >
              <Profile />
            </div>
          </>
        )}

        {/* Другие неизвестные маршруты — через Outlet, чтобы не дублировать наши страницы */}
        {!['/', '/ai', '/battle', '/quests', '/subscription', '/profile'].includes(pathname) && (
          <Outlet context={{ bootData }} />
        )}
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
          try { (window as any).__exampliRequireBoot2 = true; } catch {}
          try { (window as any).__exampliBootLocked = true; } catch {}
          try {
            const once = (window as any).__exampliBootOnce;
            if (once && typeof once === 'object') once.started = false;
          } catch {}
          setOpenCoursePicker(false);
          setBootReady(false);
          setUiWarmed(false);
          try {
            await setUserSubjects([s.code]);
            window.dispatchEvent(new CustomEvent('exampli:courseChanged', { detail: { title: s.title, code: s.code } } as any));
          } finally {
            try { window.dispatchEvent(new Event('exampli:startBoot')); } catch {}
            setTimeout(() => { try { delete (window as any).__exampliBootLocked; } catch {} }, 0);
          }
        }}
      />

      {/* Нижняя навигация (после загрузки, чтобы не мигала под сплэшем) */}
      {showBottom && bootDone && <BottomNav />}

      {/* Vercel Speed Insights */}
      <SpeedInsights />
    </div>
  );
}