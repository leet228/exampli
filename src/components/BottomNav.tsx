import { NavLink } from 'react-router-dom';
import { hapticTiny } from '../lib/haptics';

type ItemProps = { to: string; iconSrc: string };

const Item = ({ to, iconSrc }: ItemProps) => (
  <NavLink
    to={to}
    onClick={hapticTiny}
    className="group relative flex flex-col items-center justify-center px-4 py-2"
  >
    {/* рамка активного таба — всегда в DOM, видимость через CSS по aria-current */}
    <span
      aria-hidden
      className="active-ring pointer-events-none absolute inset-1 border-2 border-[#3BC4FF] rounded-md"
    />
    {/* уменьшается только иконка */}
    <img
      src={iconSrc}
      alt=""
      className="w-9 h-9 transition-transform duration-150 group-active:scale-90"
    />
  </NavLink>
);

export default function BottomNav() {
  return (
    <nav className="bottomnav fixed left-0 right-0 z-[45] 
                    bottom-[max(env(safe-area-inset-bottom),20px)] 
                    pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="mx-auto max-w-xl">
        {/* узкий бар: немного не до краёв экрана */}
        <div className="hud-bar mx-3.5 flex items-center justify-around py-2">
          <Item to="/"             iconSrc="/stickers/home.svg" />
          <Item to="/rating"       iconSrc="/stickers/trophy.svg" />
          <Item to="/subscription" iconSrc="/stickers/diamond.svg" />
          <Item to="/profile"      iconSrc="/stickers/profile.svg" />
        </div>
      </div>
    </nav>
  );
}
