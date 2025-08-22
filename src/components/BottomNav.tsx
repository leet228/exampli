import { NavLink } from 'react-router-dom';
import { hapticTiny } from '../lib/haptics';

type ItemProps = { to: string; iconSrc: string };

const Item = ({ to, iconSrc }: ItemProps) => (
  <NavLink
    to={to}
    onClick={hapticTiny}
    className="group relative flex flex-col items-center justify-center px-4 py-3 overflow-visible min-h-[64px]"
    data-icon={iconSrc.includes('/ai.svg') ? 'ai' : undefined}
  >
    {/* рамка активного таба — всегда в DOM, видимость через CSS по aria-current */}
    <span
      aria-hidden
      className="active-ring pointer-events-none absolute inset-1 border-2 border-[#3BC4FF] rounded-md"
    />
    <img
      src={iconSrc}
      alt=""
      className={`${iconSrc.includes('/ai.svg') ? 'aspect-square object-contain shrink-0' : 'aspect-square object-contain shrink-0'} transition-transform duration-150 group-active:scale-90`}
      width={iconSrc.includes('/ai.svg') ? 56 : 48}
      height={iconSrc.includes('/ai.svg') ? 56 : 48}
      style={{ width: iconSrc.includes('/ai.svg') ? '56px' : '48px', height: iconSrc.includes('/ai.svg') ? '56px' : '48px' }}
    />
  </NavLink>
);

export default function BottomNav() {
  return (
    <nav className="bottomnav fixed left-0 right-0 z-[45] !bottom-0 pb-0">
      <div className="mx-auto max-w-xl">
        {/* узкий бар: немного не до краёв экрана */}
        <div className="hud-bar mx-3.5 flex items-center justify-around py-3 pb-6">
          <Item to="/"             iconSrc="/stickers/home.svg" />
          <Item to="/quests"       iconSrc="/stickers/quests.svg" />
          <Item to="/battle"       iconSrc="/stickers/battle.svg" />
          <Item to="/ai"           iconSrc="/stickers/ai.svg" />
          <Item to="/subscription" iconSrc="/stickers/diamond.svg" />
          <Item to="/profile"      iconSrc="/stickers/profile.svg" />
        </div>
      </div>
    </nav>
  );
}
