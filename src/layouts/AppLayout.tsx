import { Outlet, useLocation } from 'react-router-dom';
import HUD from '../components/HUD';
import BottomNav from '../components/BottomNav';

const NAV_ROUTES = new Set<string>(['/','/rating','/subscription','/profile']);
const HUD_ROUTES = new Set<string>(['/']); // HUD только на главной

export default function AppLayout() {
  const { pathname } = useLocation();
  const showBottom = NAV_ROUTES.has(pathname);
  const showHUD = HUD_ROUTES.has(pathname);

  return (
    <div className="min-h-screen safe-top safe-bottom main-scroll">
      {showHUD && <HUD />}
      <div className="max-w-xl mx-auto p-5">
        <Outlet />
      </div>
      {showBottom && <BottomNav />}
    </div>
  );
}
