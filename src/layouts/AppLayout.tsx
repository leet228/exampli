// src/pages/AppLayout.tsx
import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import HUD from '../components/HUD';
import BottomNav from '../components/BottomNav';
import Splash from '../components/Splash';
import type { BootData } from '../lib/boot';
import Onboarding from '../components/Onboarding';

export default function AppLayout() {
  const { pathname } = useLocation();

  // HUD только на «Дороге»
  const showHUD = pathname === '/';
  // нижняя навигация на этих маршрутах
  const showBottom = ['/', '/quests', '/battle', '/ai', '/subscription', '/profile'].includes(pathname);

  const [bootDone, setBootDone] = useState(false);
  const [bootData, setBootData] = useState<BootData | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try { return localStorage.getItem('exampli:onboardDone') !== '1'; } catch { return true; }
  });

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
      // решаем показывать ли онбординг на основе сервера
      const hasSubjects = (ce.detail?.subjects?.length || 0) > 0;
      // если поле phone_number не было загружено — не блокируем по этому признаку
      const needsPhone = !!(ce.detail as any)?.user && !((ce.detail as any)?.user?.phone_number);
      try {
        const localDone = localStorage.getItem('exampli:onboardDone') === '1';
        setShowOnboarding(!localDone && (!hasSubjects || needsPhone));
      } catch {
        setShowOnboarding(!hasSubjects || needsPhone);
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
            // Откроем выбор курса сразу после онбординга
            setTimeout(() => {
              window.dispatchEvent(new Event('exampli:openAddCourse'));
            }, 0);
          }}
        />
      )}

      {/* Нижняя навигация (после загрузки, чтобы не мигала под сплэшем) */}
      {showBottom && bootDone && <BottomNav />}
    </div>
  );
}
