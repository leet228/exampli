import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { cacheGet, CACHE_KEYS } from '../lib/cache';
import { hapticTiny } from '../lib/haptics';

type ItemProps = { to: string; iconSrc: string; currentPath: string };

const Item = ({ to, iconSrc, currentPath }: ItemProps) => {
  return (
    <NavLink
      to={to}
      onClick={(e) => {
        hapticTiny();
        if (currentPath === to) {
          try { e.preventDefault(); } catch {}
          try { window.dispatchEvent(new Event('exampli:homeReselect')); } catch {}
        }
      }}
      className="group relative flex flex-col items-center justify-center px-2 py-2 overflow-visible min-h-[54px]"
    >
      {/* рамка активного таба — всегда в DOM, видимость через CSS по aria-current */}
      <span
        aria-hidden
        className="active-ring pointer-events-none absolute border-2 border-[#3BC4FF]"
      />
      <span className="w-[32px] h-[32px] inline-flex items-center justify-center shrink-0 transition-transform duration-150 group-active:scale-90">
        <img
          src={iconSrc}
          alt=""
          className="w-full h-full object-contain block"
        />
      </span>
    </NavLink>
  );
};

export default function BottomNav() {
  const { pathname } = useLocation();
  const isAI = pathname === '/ai';
  const [isPlus, setIsPlus] = useState<boolean>(() => {
    try {
      const pu0 = (cacheGet<any>(CACHE_KEYS.user)?.plus_until) || (window as any)?.__exampliBoot?.user?.plus_until;
      return Boolean(pu0 && new Date(String(pu0)).getTime() > Date.now());
    } catch { return false; }
  });
  useEffect(() => {
    const onPlus = (evt: Event) => {
      const e = evt as CustomEvent<{ plus_until?: string } & any>;
      if (e.detail?.plus_until !== undefined) {
        try { setIsPlus(Boolean(e.detail.plus_until && new Date(e.detail.plus_until).getTime() > Date.now())); } catch {}
      }
    };
    window.addEventListener('exampli:statsChanged', onPlus as EventListener);
    return () => window.removeEventListener('exampli:statsChanged', onPlus as EventListener);
  }, []);
  const whiteOnAiNoPlus = isAI && !isPlus;
  return (
    <nav className={`bottomnav fixed left-0 right-0 z-[45] !bottom-0 pb-0 ${whiteOnAiNoPlus ? 'bottomnav-white' : ''}`}>
      <div className="mx-auto max-w-xl">
        {/* узкий бар: немного не до краёв экрана */}
        <div className="hud-bar mx-3.5 flex items-center justify-evenly gap-2 py-2 pb-5">
          <Item to="/"             iconSrc="/stickers/home2.svg" currentPath={pathname} />
          <Item to="/quests"       iconSrc="/stickers/quests2.svg" currentPath={pathname} />
          <Item to="/battle"       iconSrc="/stickers/battle2.svg" currentPath={pathname} />
          <Item to="/ai"           iconSrc="/stickers/ai2.svg" currentPath={pathname} />
          <Item to="/subscription" iconSrc="/stickers/diamond2.svg" currentPath={pathname} />
          <Item to="/profile"      iconSrc="/stickers/profile4.svg" currentPath={pathname} />
        </div>
      </div>
    </nav>
  );
}
