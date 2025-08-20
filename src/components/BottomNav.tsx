import { NavLink } from 'react-router-dom';
import { hapticTiny } from '../lib/haptics';

type ItemProps = { to: string; iconSrc: string };

const Item = ({ to, iconSrc }: ItemProps) => (
  <NavLink
    to={to}
    onClick={hapticTiny}
    className="group relative flex flex-col items-center justify-center px-4 py-2"
  >
    {/* квадратная рамка для активного */}
    <span className="active-ring pointer-events-none absolute -inset-1 border-2 border-[#3BC4FF] rounded-md" />
    <img
      src={iconSrc}
      alt=""
      className="w-8 h-8 transition-transform duration-150 group-active:scale-90"
    />
  </NavLink>
);

export default function BottomNav() {
  return (
    <nav className="bottomnav fixed bottom-0 left-0 right-0 z-[45] pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="mx-auto max-w-xl">
        <div className="hud-bar flex items-center justify-around py-2">
          <Item to="/"             iconSrc="/stickers/home.svg" />
          <Item to="/rating"       iconSrc="/stickers/trophy.svg" />
          <Item to="/subscription" iconSrc="/stickers/diamond.svg" />
          <Item to="/profile"      iconSrc="/stickers/profile.svg" />
        </div>
      </div>
    </nav>
  );
}
