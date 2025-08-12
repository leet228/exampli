// src/components/Splash.tsx
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { bootPreload, BootData } from '../lib/boot';

export default function Splash({ onReady }: { onReady: (boot: BootData) => void }) {
  const [progress, setProgress] = useState(0);
  const [boot, setBoot] = useState<BootData | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const data = await bootPreload(p => live && setProgress(p));
      if (!live) return;
      setBoot(data);
      // небольшая пауза ради красивого завершения
      setTimeout(() => { setDone(true); onReady(data); }, 250);
    })();
    return () => { live = false; };
  }, [onReady]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02, y: '-110%' }} // «врыв» вверх
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          style={{ background: 'var(--bg)' }}
        >
          <div className="relative w-[min(560px,90vw)] aspect-[1.6]">
            {/* фоновая карточка */}
            <div className="absolute inset-0 rounded-3xl border border-white/10 bg-[color:var(--card)] shadow-[0_20px_60px_rgba(0,0,0,.35)]" />

            {/* картинка */}
            <img
              src="/mascots.png"
              alt="Exampli mascots"
              className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
              draggable={false}
            />

            {/* --- АНИМАЦИИ СВЕРХУ ИЗОБРАЖЕНИЯ --- */}

            {/* левый — глаза (мигание) */}
            <Blink style={{ left: '23%', top: '43%' }} />
            <Blink style={{ left: '31%', top: '43%' }} />

            {/* правый — глаза (мигание) */}
            <Blink style={{ left: '68%', top: '42%' }} />
            <Blink style={{ left: '76%', top: '42%' }} />

            {/* рука левого — лёгкое махание */}
            <WavingHand />

            {/* лёгкое подпрыгивание обоих (вся сцена) */}
            <motion.div
              className="absolute inset-0"
              animate={{ y: [-2, 2, -2] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* прогресс */}
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-[72%]">
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg,#ec4899,#60a5fa)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.3 }}
                />
              </div>
              <div className="mt-2 text-xs text-center text-[color:var(--muted)]">
                Загружаем курс и уроки… {progress}%
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* --- субкомпоненты --- */

function Blink({ style }: { style: React.CSSProperties }) {
  return (
    <span
      className="absolute block"
      style={{
        ...style,
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        background: 'white',
        transformOrigin: '50% 50%',
        animation: 'blink 3.2s infinite',
        boxShadow: '0 0 6px rgba(255,255,255,.25)',
      }}
    />
  );
}

function WavingHand() {
  // упрощённая рука: «локоть» + ладонь
  return (
    <div
      className="absolute"
      style={{ left: '7%', top: '46%', width: 56, height: 56, transformOrigin: '10px 28px' }}
    >
      <motion.div
        className="absolute left-0 top-0"
        animate={{ rotate: [0, 16, -6, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ width: 56, height: 56 }}
      >
        <div
          style={{
            position: 'absolute',
            left: 6,
            top: 20,
            width: 34,
            height: 14,
            borderRadius: 14,
            background: '#22c55e',
            boxShadow: '0 0 8px rgba(34,197,94,.35)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 34,
            top: 14,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#22c55e',
          }}
        />
      </motion.div>
    </div>
  );
}
