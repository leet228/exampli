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

export default function AppLayout() {
  const { pathname } = useLocation();

  // HUD только на «Дороге»
  const showHUD = pathname === '/';
  // нижняя навигация на этих маршрутах
  const showBottom = ['/', '/quests', '/battle', '/ai', '/subscription', '/profile'].includes(pathname);

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
      // Логика показа онбординга/выбора курса:
      // 1) Если нет phone_number — показываем онбординг (как раньше)
      // 2) Иначе если нет added_course — сразу открываем выбор курса
      // 3) Иначе — ничего не показываем
      const userHasPhone = !!ce.detail?.user?.phone_number;
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
    return () => window.removeEventListener('exampli:bootData', ready as EventListener);
  }, []);

  // После ухода сплэша подсказать оверлеям пересчитать позицию
  useEffect(() => {
    if (bootDone) {
      window.dispatchEvent(new Event('exampli:overlayToggled'));
    }
  }, [bootDone]);

  return (
    <div className="min-h-screen safe-top safe-bottom main-scroll">
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

      <div id="app-container" className="max-w-xl mx-auto p-5">
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
          // users_onboarding удалён: ничего не обновляем
          setOpenCoursePicker(false);
          // оповестим остальных
          window.dispatchEvent(new CustomEvent('exampli:courseChanged', { detail: { title: s.title, code: s.code } } as any));
        }}
      />

      {/* Нижняя навигация (после загрузки, чтобы не мигала под сплэшем) */}
      {showBottom && bootDone && <BottomNav />}
    </div>
  );
}