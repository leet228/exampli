// src/components/Splash.tsx
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { bootPreload, type BootData } from '../lib/boot';

type Props = { onReady: (boot: BootData) => void };

const FALLBACK_BOOT: BootData = {
  user: null,
  stats: { xp: 0, streak: 0, hearts: 5 },
  subjects: [],
  lessons: [],
};

export default function Splash({ onReady }: Props) {
  const doneRef = useRef(false);

  useEffect(() => {
    // 1) Сразу снимем системный прелоадер Telegram
    const tg = (window as any)?.Telegram?.WebApp;
    try {
      tg?.ready();
      tg?.expand?.();
    } catch {}

    let alive = true;

    // 2) Защита от зависаний: если bootPreload завис/упал — уйти по таймауту
    const timeout = setTimeout(() => {
      if (!alive || doneRef.current) return;
      doneRef.current = true;
      onReady(FALLBACK_BOOT);
    }, 4000);

    // 3) Основная загрузка
    (async () => {
      try {
        const data = await bootPreload();
        if (!alive || doneRef.current) return;
        doneRef.current = true;
        onReady(data);
      } catch {
        if (!alive || doneRef.current) return;
        doneRef.current = true;
        onReady(FALLBACK_BOOT);
      } finally {
        clearTimeout(timeout);
      }
    })();

    return () => {
      alive = false;
      clearTimeout(timeout);
    };
  }, [onReady]);

  // Сам сплэш — просто картинка/логотип поверх
  return (
    <AnimatePresence>
      <motion.div
        key="splash"
        className="fixed inset-0 z-[9999] bg-[color:var(--bg,#0b0f14)]"
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="w-full h-full grid place-items-center">
          <img
            src="/kursik.svg"
            alt="Загрузка"
            className="w-40 h-40 object-contain select-none"
            draggable={false}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
