// src/pages/AppLayout.tsx
import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import HUD from '../components/HUD';
import BottomNav from '../components/BottomNav';
import Splash from '../components/Splash';
import type { BootData } from '../lib/boot';
import Onboarding from '../components/Onboarding';
import AddCourseBlocking from '../components/panels/AddCourseBlocking';
import { setUserSubjects } from '../lib/userState';
import { supabase } from '../lib/supabase';
import SpeedInsights from '../lib/SpeedInsights';
import Profile from '../pages/Profile';
import Home from '../pages/Home';
import AI from '../pages/AI';
import Battle from '../pages/Battle';
import Quests from '../pages/Quests';
import Subscription from '../pages/Subscription';
import TopicsPanel from '../components/panels/TopicsPanel';
import AddCourseSheet from '../components/panels/AddCourseSheet';


export default function AppLayout() {
  const { pathname } = useLocation();

  // HUD только на «Дороге»
  const showHUD = pathname === '/';
  // нижняя навигация на этих маршрутах
  const showBottom = ['/', '/quests', '/battle', '/ai', '/subscription', '/profile'].includes(pathname);
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
  const bootDone = bootReady && uiWarmed;

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

  // После ухода сплэша подсказать оверлеям пересчитать позицию
  useEffect(() => {
    if (bootDone) {
      window.dispatchEvent(new Event('exampli:overlayToggled'));
      // Фоновый прогрев для мгновенных панелей: если есть список всех предметов — прогреем ещё 1-2 помимо активного
      try {
        const boot = (window as any).__exampliBoot as BootData | null;
        const activeCode = localStorage.getItem('exampli:active_course_code');
        const active = (boot?.subjects || []).find((s) => s.code === activeCode);
        const rest = (boot?.subjectsAll || []).filter((s) => s.id !== active?.id).slice(0, 2);
        // прогреем темы/подтемы для пары курсов в фоне
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

      {/* Постоянный прогрев AddCourseSheet (без сайд‑эффектов и в отдельном руте) */}
      {bootReady && (
        <div className="prewarm-mount" aria-hidden="true" id="prewarm-root">
          <AddCourseSheet open onClose={() => {}} onAdded={() => {}} useTelegramBack={false} />
        </div>
      )}

      {/* Верхний HUD (после загрузки) */}
      {showHUD && bootDone && <HUD />}

      <div id="app-container" className={isAI ? 'w-full' : 'max-w-xl mx-auto p-5'}>
        {bootReady && (
          <>
            {/* Home */}
            <div ref={homeRef} className={pathname === '/' ? '' : 'prewarm-mount'} aria-hidden={pathname === '/' ? undefined : true}>
              <Home />
            </div>
            {/* AI */}
            <div ref={aiRef} className={pathname === '/ai' ? '' : 'prewarm-mount'} aria-hidden={pathname === '/ai' ? undefined : true}>
              <AI />
            </div>
            {/* Battle */}
            <div ref={battleRef} className={pathname === '/battle' ? '' : 'prewarm-mount'} aria-hidden={pathname === '/battle' ? undefined : true}>
              <Battle />
            </div>
            {/* Quests */}
            <div ref={questsRef} className={pathname === '/quests' ? '' : 'prewarm-mount'} aria-hidden={pathname === '/quests' ? undefined : true}>
              <Quests />
            </div>
            {/* Subscription */}
            <div ref={subsRef} className={pathname === '/subscription' ? '' : 'prewarm-mount'} aria-hidden={pathname === '/subscription' ? undefined : true}>
              <Subscription />
            </div>
            {/* Profile */}
            <div ref={profileRef} className={pathname === '/profile' ? '' : 'prewarm-mount'} aria-hidden={pathname === '/profile' ? undefined : true}>
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