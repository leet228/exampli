import { Outlet, useLocation } from 'react-router-dom';
import HUD from '../components/HUD';
import BottomNav from '../components/BottomNav';

const NAV_ROUTES = new Set<string>(['/', '/subscription', '/profile']); // Курсы убрали как отдельную страницу — выбор идёт через шторку

export default function AppLayout(){
  const { pathname } = useLocation();
  const showBottom = NAV_ROUTES.has(pathname);
  return (
    <div className="min-h-screen safe-top safe-bottom main-scroll">
      <HUD />
      <div className="max-w-xl mx-auto p-5">
        <Outlet />
      </div>
      {showBottom && <BottomNav />}
    </div>
  );
}