import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import HUD from '../components/HUD';
import BottomNav from '../components/BottomNav';
import Splash from '../components/Splash';
import type { BootData } from '../lib/boot';

export default function AppLayout() {
  const { pathname } = useLocation();
  const showHUD = pathname === '/';            // HUD только на «Дороге»
  const showBottom = ['/', '/rating', '/subscription', '/profile'].includes(pathname);

  const [bootDone, setBootDone] = useState(false);
  const [bootData, setBootData] = useState<BootData | null>(null);

  useEffect(() => {
    const ready = (e: any) => { setBootData(e.detail); setBootDone(true); };
    window.addEventListener('exampli:bootData', ready as EventListener);
    return () => window.removeEventListener('exampli:bootData', ready as EventListener);
  }, []);

  return (
    <div className="min-h-screen safe-top safe-bottom main-scroll">
      {/* Сплэш поверх всего до загрузки */}
      {!bootDone && <Splash onReady={(data)=>{ setBootData(data); setBootDone(true); }} />}

      {showHUD && <HUD />}
      <div id="app-container" className="max-w-xl mx-auto p-5">
        <Outlet />
      </div>
      {showBottom && <BottomNav />}
    </div>
  );
}
