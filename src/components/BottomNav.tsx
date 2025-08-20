import { NavLink } from 'react-router-dom';
import { hapticTiny } from '../lib/haptics';

type ItemProps = { to: string; iconSrc: string; label?: string };


const Item = ({ to, iconSrc, label = '' }: ItemProps) => (
  <NavLink
    to={to}
    onClick={hapticTiny}
    className="group relative flex flex-col items-center justify-center px-4 py-2 select-none transition-opacity duration-150"
  >
    {/* Квадратная рамка. Всегда в DOM, видимость — через CSS по aria-current */}
    <span
      aria-hidden
      className="active-ring pointer-events-none absolute -inset-[6px] rounded-[10px] border-2 border-[#3BC4FF]"
    />

    {/* Уменьшается только иконка */}
    <img
      src={iconSrc}
      alt={label || 'icon'}
      className="w-10 h-10 transition-transform duration-150 group-active:scale-90"
    />

    {label ? <div className="mt-1 text-[11px] opacity-80">{label}</div> : null}
  </NavLink>
);

export default function BottomNav() {
  return (
    <nav className="bottomnav fixed bottom-0 left-0 right-0 z-[45] pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="mx-auto max-w-xl px-4">
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
