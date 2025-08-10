import { Outlet, useLocation } from 'react-router-dom';
import HUD from '../components/HUD';
import BottomNav from '../components/BottomNav';

// На этих маршрутах нижняя навигация показана. На остальных — скрыта.
const NAV_ROUTES = new Set<string>(['/', '/onboarding', '/profile']);

export default function AppLayout() {
  const { pathname } = useLocation();
  const showBottom = NAV_ROUTES.has(pathname);

  return (
    <div className="min-h-screen pb-28">
      <HUD />
      <div className="max-w-xl mx-auto p-5">
        <Outlet />
      </div>
      {showBottom && <BottomNav />}
    </div>
  );
}