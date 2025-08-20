// src/components/Splash.tsx
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { bootPreload, BootData } from '../lib/boot';

export default function Splash({ onReady }: { onReady: (boot: BootData) => void }) {
  const [boot, setBoot] = useState<BootData | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const data = await bootPreload();
      if (!live) return;
      setBoot(data);
      setTimeout(() => { setDone(true); onReady(data); }, 250);
    })();
    return () => { live = false; };
  }, [onReady]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#fbbb32]"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
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