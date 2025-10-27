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
import Profile from '../pages/Profile';
import Home from '../pages/Home';
import AI from '../pages/AI';
import Battle from '../pages/Battle';
import Quests from '../pages/Quests';
import Subscription from '../pages/Subscription';
import TopicsPanel from '../components/panels/TopicsPanel';
import AddCourseSheet from '../components/panels/AddCourseSheet';
import FriendsPanel from '../components/panels/FriendsPanel';
import AddFriendsPanel from '../components/panels/AddFriendsPanel';


export default function AppLayout() {
  const { pathname } = useLocation();

  // HUD всегда смонтирован, но скрывается вне «Дороги»
  const showHUD = true;
  // нижняя навигация на этих маршрутах (Battle снова включён)
  const showBottom = ['/', '/quests', '/battle', '/ai', '/subscription', '/profile'].includes(pathname);
  const isAI = pathname === '/ai';
  const isBattle = pathname === '/battle';
  const isProfile = pathname === '/profile';
  const isHome = pathname === '/';
  const isSubs = pathname === '/subscription';

  const [bootReady, setBootReady] = useState(false); // данные загружены и кэшированы
  const [uiWarmed, setUiWarmed] = useState(false);   // профиль смонтирован
  const [bootData, setBootData] = useState<BootData | null>(null);
  const [splashDone, setSplashDone] = useState(false); // сплэш скрыт
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
  const [prewarmFriendsDone, setPrewarmFriendsDone] = useState(false);
  const appReady = bootReady && uiWarmed;

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

  // слушаем глобальное событие из bootPreload (дубликат защиты)
  useEffect(() => {
    const ready = (e: Event) => {
      const ce = e as CustomEvent<BootData>;
      setBootData(ce.detail);
      // не меняем splashDone здесь; bootReady управляется через onReady Splash
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
    const reboot = () => { setBootReady(false); setUiWarmed(false); setSplashDone(false); };
    window.addEventListener('exampli:reboot', reboot as EventListener);
    return () => window.removeEventListener('exampli:bootData', ready as EventListener);
  }, []);

  // После ухода сплэша подсказать оверлеям пересчитать позицию
  useEffect(() => {
    if (splashDone) {
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
  }, [splashDone]);

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
      // Сбрасываем скролл при смене страницы, чтобы каждая страница начинала с верха
      if (el && !hidden) {
        try {
          // Находим первый скроллируемый контейнер внутри страницы
          const scrollable = el.querySelector('.main-scroll') as HTMLElement || el;
          if (scrollable && 'scrollTop' in scrollable) {
            scrollable.scrollTop = 0;
          }
        } catch {}
      }
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

  // После bootReady один раз прогреваем FriendsPanel и AddFriendsPanel, затем размонтируем
  useEffect(() => {
    if (bootReady && !prewarmFriendsDone) {
      const id = requestAnimationFrame(() => setPrewarmFriendsDone(true));
      return () => cancelAnimationFrame(id);
    }
  }, [bootReady, prewarmFriendsDone]);

  return (
    <div className={`h-full overflow-hidden`}>
      {/* Сплэш поверх всего до загрузки */}
      {!splashDone && (
        <Splash
          onReady={(data) => {
            setBootData(data);
            setBootReady(true);
          }}
          onFinish={() => {
            setSplashDone(true);
          }}
        />
      )}

      {/* Прогрев TopicsPanel после готовности данных, но до скрытия сплэша */}
      {bootReady && !splashDone && (
        <div className="prewarm-mount" aria-hidden="true">
          <TopicsPanel open onClose={() => {}} />
        </div>
      )}

      {/* Прогрев BottomNav (невидимый), HUD монтируется постоянно ниже */}
      {bootReady && !splashDone && (
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

      <div id="app-container" className={((isAI || isProfile || isBattle || isHome || isSubs) ? 'w-full' : 'max-w-xl mx-auto p-5') + ' h-full overflow-hidden'}>
        {bootReady && (
          <>
            {/* Home */}
            <div
              key="home"
              ref={homeRef}
              className={'main-scroll safe-top safe-bottom ' + (pathname === '/' ? '' : 'prewarm-mount')}
              style={{ paddingTop: 'calc(var(--hud-top) + var(--hud-h) + 20px)', paddingBottom: 'max(env(safe-area-inset-bottom), 120px)' }}
              aria-hidden={pathname === '/' ? undefined : true}
            >
              <Home />
            </div>
            {/* AI */}
            <div
              key="ai"
              ref={aiRef}
              className={'main-scroll safe-top safe-bottom ' + (pathname === '/ai' ? '' : 'prewarm-mount')}
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 120px)' }}
              aria-hidden={pathname === '/ai' ? undefined : true}
            >
              <AI />
            </div>
            {/* Battle */}
            <div key="battle" ref={battleRef} className={(pathname === '/battle' ? 'h-full overflow-hidden' : 'prewarm-mount')} aria-hidden={pathname === '/battle' ? undefined : true}>
              <Battle />
            </div>
            {/* Quests */}
            <div
              key="quests"
              ref={questsRef}
              className={'main-scroll safe-top safe-bottom ' + (pathname === '/quests' ? '' : 'prewarm-mount')}
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 120px)' }}
              aria-hidden={pathname === '/quests' ? undefined : true}
            >
              <Quests />
            </div>
            {/* Subscription */}
            <div
              key="subscription"
              ref={subsRef}
              className={'main-scroll safe-bottom ' + (pathname === '/subscription' ? '' : 'prewarm-mount')}
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 160px)', paddingBottom: 'max(env(safe-area-inset-bottom), 120px)' }}
              aria-hidden={pathname === '/subscription' ? undefined : true}
            >
              <Subscription />
            </div>
            {/* Profile */}
            <div
              key="profile"
              ref={profileRef}
              className={'main-scroll safe-bottom ' + (pathname === '/profile' ? '' : 'prewarm-mount')}
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 160px)', paddingBottom: 'max(env(safe-area-inset-bottom), 120px)' }}
              aria-hidden={pathname === '/profile' ? undefined : true}
            >
              <Profile />
            </div>
          </>
        )}

        {/* Другие неизвестные маршруты — через Outlet, чтобы не дублировать наши страницы */}
        {!['/', '/ai', '/battle', '/quests', '/subscription', '/profile'].includes(pathname) && (
          <div className="main-scroll safe-top safe-bottom">
            <Outlet context={{ bootData }} />
          </div>
        )}
      </div>

      {/* Onboarding поверх после boot */}
      {splashDone && (
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
      {showBottom && splashDone && <BottomNav />}

      {/* Vercel Speed Insights */}
      <SpeedInsights />
    </div>
  );
}