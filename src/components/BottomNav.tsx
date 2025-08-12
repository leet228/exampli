import { NavLink } from 'react-router-dom';

const Item = ({ to, label, icon }: { to: string; label: string; icon: string }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `flex flex-col items-center gap-1 px-4 py-2 rounded-2xl ${
        isActive ? 'bg-white/10' : 'hover:bg-white/5'
      } transition`
    }>
    <div className="text-lg">{icon}</div>
    <div className="text-[11px] text-muted">{label}</div>
  </NavLink>
);

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="mx-auto max-w-xl px-4">
        <div className="border border-white/10 rounded-3xl bg-[color:var(--card)]/90 backdrop-blur shadow-soft flex items-center justify-around py-2">
          <Item to="/"             label="Домой"      icon="🏠" />
          <Item to="/rating"       label="Рейтинг"    icon="🏆" />
          <Item to="/subscription" label="Абонемент"  icon="💎" />
          <Item to="/profile"      label="Профиль"    icon="👤" />
        </div>
      </div>
    </nav>
  );
}
