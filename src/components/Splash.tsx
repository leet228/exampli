// src/components/Splash.tsx
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { bootPreload, BootData } from '../lib/boot';

export default function Splash({ onReady }: { onReady: (boot: BootData) => void }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      // грузим нужные данные, но НИЧЕГО лишнего не рисуем
      const data = await bootPreload();
      if (!live) return;
      // чуть-чуть подождём для красивого fade-out (по желанию можно убрать)
      setTimeout(() => {
        if (!live) return;
        setDone(true);
        onReady(data);
      }, 150);
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
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          style={{ background: 'var(--bg)' }}
        >
          {/* единственная картинка на весь экран */}
          <img
            src="/kursik.svg"
            alt="Загрузка"
            className="w-full h-full object-contain"
            draggable={false}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
