import { NavLink } from 'react-router-dom';
import { ReactNode } from 'react';
import { hapticTiny } from '../lib/haptics'; // поправь путь под свой проект

type ItemProps = {
  to: string;
  label?: string;
  iconSrc?: string;
  iconEmoji?: ReactNode;
};

const Item = ({ to, label = '', iconSrc, iconEmoji }: ItemProps) => (
  <NavLink
    to={to}
     // моментальный отклик при тапе
    onClick={hapticTiny}       // резерв на случай отсутствия Pointer Events
    className={({ isActive }) =>
      `flex flex-col items-center gap-1 px-4 py-2 rounded-2xl ${
        isActive ? 'bg-white/10' : 'hover:bg-white/5'
      } transition`
    }
  >
    {iconSrc ? (
      <img src={iconSrc} alt={label || 'icon'} className="w-6 h-6" />
    ) : (
      <span className="text-lg">{iconEmoji}</span>
    )}
    {label ? (
      <div className="text-[11px] text-muted">{label}</div>
    ) : (
      <span className="sr-only">{to}</span>
    )}
  </NavLink>
);

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="mx-auto max-w-xl px-4">
        <div className="border border-white/10 rounded-3xl bg-[color:var(--card)]/90 backdrop-blur shadow-soft flex items-center justify-around py-2">
          <Item to="/"             iconSrc="/stickers/home.svg" />
          <Item to="/rating"       iconSrc="/stickers/trophy.svg" />
          <Item to="/subscription" iconSrc="/stickers/diamond.svg" />
          <Item to="/profile"      iconSrc="/stickers/profile.svg" />
        </div>
      </div>
    </nav>
  );
}
