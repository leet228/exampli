// src/pages/AppLayout.tsx
import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import HUD from '../components/HUD';
import BottomNav from '../components/BottomNav';
import Splash from '../components/Splash';
import type { BootData } from '../lib/boot';
import Onboarding from '../components/Onboarding';
import AddCourseBlocking from '../components/panels/AddCourseBlocking';
import { setUserSubjects } from '../lib/userState';
import { supabase } from '../lib/supabase';
import SpeedInsights from '../lib/SpeedInsights';
// Hidden pre-mount of heavy overlays to avoid first-mount jank
import AddCourseSheet from '../components/panels/AddCourseSheet';
import FriendsPanel from '../components/panels/FriendsPanel';
import AddFriendsPanel from '../components/panels/AddFriendsPanel';
import TopicsPanel from '../components/panels/TopicsPanel';
import CourseSheet from '../components/sheets/CourseSheet';
import EnergySheet from '../components/sheets/EnergySheet';
import StreakSheet from '../components/sheets/StreakSheet';

export default function AppLayout() {
  const { pathname } = useLocation();

  // HUD только на «Дороге»
  const showHUD = pathname === '/';
  // нижняя навигация на этих маршрутах
  const showBottom = ['/', '/quests', '/battle', '/ai', '/subscription', '/profile'].includes(pathname);
  const isAI = pathname === '/ai';

  const [bootDone, setBootDone] = useState(false);
  const [bootData, setBootData] = useState<BootData | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [openCoursePicker, setOpenCoursePicker] = useState<boolean>(false);

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
      setBootDone(true);
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
    const reboot = () => { setBootDone(false); };
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

  return (
    <div className={`min-h-screen ${isAI ? '' : 'safe-top'} safe-bottom main-scroll`}>
      {/* Сплэш поверх всего до загрузки */}
      {!bootDone && (
        <Splash
          onReady={(data) => {
            setBootData(data);
            setBootDone(true);
          }}
        />
      )}

      {/* Верхний HUD (после загрузки) */}
      {showHUD && bootDone && <HUD />}

      <div id="app-container" className={isAI ? 'w-full' : 'max-w-xl mx-auto p-5'}>
        <Outlet context={{ bootData }} />
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
          setBootDone(false);
        }}
      />

      {/* Нижняя навигация (после загрузки, чтобы не мигала под сплэшем) */}
      {showBottom && bootDone && <BottomNav />}

      {/* Vercel Speed Insights */}
      <SpeedInsights />

      {/* Hidden pre-mount hub: mounts all heavy overlays once to eliminate first-open cost */}
      {bootDone && (
        <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden>
          <AddCourseSheet open={true} onClose={() => {}} onAdded={() => {}} useTelegramBack={false} />
          <FriendsPanel open={true} onClose={() => {}} />
          <AddFriendsPanel open={true} onClose={() => {}} />
          <TopicsPanel open={true} onClose={() => {}} />
          <CourseSheet open={true} onClose={() => {}} />
          <EnergySheet open={true} onClose={() => {}} />
          <StreakSheet open={true} onClose={() => {}} />
        </div>
      )}
    </div>
  );
}