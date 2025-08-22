import { NavLink } from 'react-router-dom';
import { hapticTiny } from '../lib/haptics';

type ItemProps = { to: string; iconSrc: string };

const Item = ({ to, iconSrc }: ItemProps) => (
  <NavLink
    to={to}
    onClick={hapticTiny}
    className="group relative flex flex-col items-center justify-center px-2 py-2 overflow-visible min-h-[56px]"
    data-icon={iconSrc.includes('/ai.svg') ? 'ai' : (iconSrc.includes('/home.svg') ? 'home' : undefined)}
  >
    {/* рамка активного таба — всегда в DOM, видимость через CSS по aria-current */}
    <span
      aria-hidden
      className="active-ring pointer-events-none absolute inset-1 border-2 border-[#3BC4FF] rounded-md"
    />
    <span className={`${iconSrc.includes('/ai.svg') ? 'w-[52px] h-[52px]' : (iconSrc.includes('/home.svg') ? 'w-[44px] h-[44px]' : 'w-[40px] h-[40px]')} inline-flex items-center justify-center shrink-0`}>
      <img
        src={iconSrc}
        alt=""
        className="w-full h-full object-contain block"
      />
    </span>
  </NavLink>
);

export default function BottomNav() {
  return (
    <nav className="bottomnav fixed left-0 right-0 z-[45] !bottom-0 pb-0">
      <div className="mx-auto max-w-xl">
        {/* узкий бар: немного не до краёв экрана */}
        <div className="hud-bar mx-3.5 flex items-center justify-center gap-2 py-2 pb-5">
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
