import { NavLink } from 'react-router-dom';
import { hapticTiny } from '../lib/haptics';

type ItemProps = {
  to: string;
  iconSrc: string;
  label?: string;
};

const Item = ({ to, iconSrc, label = '' }: ItemProps) => (
  <NavLink
    to={to}
    onClick={hapticTiny}
    className={({ isActive }) =>
      [
        // базовая плитка
        'group flex flex-col items-center justify-center rounded-2xl px-4 py-2',
        'transition-transform duration-150 active:scale-95', // анимация «сжать при тапе»
        isActive
          // выделение активного таба (рамка + подсветка как у дуо)
          ? 'bg-[rgba(255,255,255,0.06)] ring-2 ring-[#3BC4FF] shadow-[0_6px_18px_rgba(0,0,0,.35)]'
          : 'opacity-80 hover:opacity-100'
      ].join(' ')
    }
  >
    <img
      src={iconSrc}
      alt={label || 'icon'}
      className="w-9 h-9 transition-transform duration-150 group-active:scale-95" // иконки больше
    />
    {label ? <div className="mt-1 text-[11px] opacity-80">{label}</div> : null}
  </NavLink>
);

export default function BottomNav() {
  return (
    <nav className="bottomnav fixed bottom-0 left-0 right-0 z-[45] pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="mx-auto max-w-xl px-4">
        <div className="hud-bar border border-white/10 rounded-3xl bg-[color:var(--card)]/90 backdrop-blur flex items-center justify-around py-2">
          <Item to="/"             iconSrc="/stickers/home.svg" />
          <Item to="/rating"       iconSrc="/stickers/trophy.svg" />
          <Item to="/subscription" iconSrc="/stickers/diamond.svg" />
          <Item to="/profile"      iconSrc="/stickers/profile.svg" />
        </div>
      </div>
    </nav>
  );
}
