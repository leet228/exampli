import React from 'react';
import { useNavigate } from 'react-router-dom';
import { hapticSelect } from '../lib/haptics';
import { motion, AnimatePresence } from 'framer-motion';

export default function SubscriptionOpening() {
  const navigate = useNavigate();
  const [step, setStep] = React.useState(0);

  // Блокируем глобальные слушатели boot/сплэша как в SubscriptionGate
  React.useEffect(() => {
    try { (window as any).__exampliBootLocked = true; } catch {}
    const stopBoot = (e: any) => { try { e?.stopImmediatePropagation?.(); } catch {} };
    window.addEventListener('exampli:startBoot', stopBoot as EventListener, { capture: true } as any);
    return () => {
      try { delete (window as any).__exampliBootLocked; } catch {}
      window.removeEventListener('exampli:startBoot', stopBoot as EventListener, { capture: true } as any);
    };
  }, []);

  const images = [
    '/opening_sub/1_sub_pic.svg',
    '/opening_sub/2_sub_pic.svg',
    '/opening_sub/3_sub_pic.svg',
    '/opening_sub/4_sub_pic.svg',
  ];

  const onPrimary = () => {
    try { hapticSelect(); } catch {}
    if (step < images.length - 1) {
      setStep((s) => Math.min(images.length - 1, s + 1));
    } else {
      navigate('/subscription');
    }
  };

  const label = step < images.length - 1 ? 'ДАЛЕЕ' : 'НАЧАТЬ';

  return (
    <div className="fixed inset-0 z-[9999]" style={{ background: '#ffffff' }}>
      <div className="absolute inset-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.img
            key={step}
            src={images[step]}
            alt=""
            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
            style={{ objectPosition: 'center' }}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          />
        </AnimatePresence>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 bottom-24 w-[min(92%,680px)] px-4">
        <PressCta onClick={onPrimary}>{label}</PressCta>
      </div>
    </div>
  );
}

function PressCta({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const base = '#3b5bff';
  const dark = shade(base, 0.25);
  const press = 6;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ y: press, boxShadow: `0 0 0 0 ${dark}` }}
      transition={{ duration: 0 }}
      className="w-full rounded-full text-white font-extrabold tracking-wider py-3 text-center"
      style={{ background: base, boxShadow: `0 ${press}px 0 0 ${dark}` }}
    >
      {children}
    </motion.button>
  );
}

function shade(hex: string, amount: number) {
  try {
    const c = hex.replace('#', '');
    const num = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
    let r = (num >> 16) & 0xff;
    let g = (num >> 8) & 0xff;
    let b = num & 0xff;
    r = Math.max(0, Math.min(255, Math.floor(r * (1 - amount))));
    g = Math.max(0, Math.min(255, Math.floor(g * (1 - amount))));
    b = Math.max(0, Math.min(255, Math.floor(b * (1 - amount))));
    const toHex = (v: number) => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch { return hex; }
}


