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
      // Онбординг по users_onboarding: если нет строки — boot создал её с false/false
      const ob = ce.detail?.onboarding || null;
      const isBrandNew = !!(window as any).__exampliNewUserCreated;
      // сбрасываем флаг «только что создан» после чтения
      (window as any).__exampliNewUserCreated = false;
      const phoneGiven = !!(ob?.phone_given);
      // НОВЫЕ ПРАВИЛА: если boarding_finished=true — ничего не показывать
      const finished = !!(ob && ob.boarding_finished);
      const needPhone = !phoneGiven;

      if (finished) {
        setShowOnboarding(false);
        setOpenCoursePicker(false);
        return;
      }

      // Решение ТОЛЬКО по users_onboarding:
      // 0) Если finished → ничего
      // 1) Если телефон не дан → онбординг (экран телефона)
      // 2) Иначе — ничего
      if (finished) {
        setShowOnboarding(false);
        setOpenCoursePicker(false);
      } else if (needPhone) {
        setOpenCoursePicker(false);
        setShowOnboarding(true);
      } else {
        setShowOnboarding(false);
        setOpenCoursePicker(false);
      }
    };
    window.addEventListener('exampli:bootData', ready as EventListener);
    // если boot уже был выполнен до монтирования, обработаем сразу
    const existing = (window as any).__exampliBoot as BootData | undefined;
    if (existing) ready(new CustomEvent('exampli:bootData', { detail: existing }) as unknown as Event);
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
          // отметим onboarding
          try {
            const tgId: number | undefined = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
            if (tgId) {
              const { data: u } = await supabase.from('users').select('id').eq('tg_id', String(tgId)).single();
              if (u?.id) await supabase.from('users_onboarding').update({ course_taken: true }).eq('user_id', u.id);
            }
          } catch {}
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
