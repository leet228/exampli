// src/components/Splash.tsx
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { bootPreload, BootData } from '../lib/boot';

export default function Splash({ onReady }: { onReady: (boot: BootData) => void }) {
  const [boot, setBoot] = useState<BootData | null>(null);
  const [done, setDone] = useState(false);

  // Блокируем прокрутку и жесты, пока сплэш на экране
  useEffect(() => {
    if (done) return;

    const scrollY = window.scrollY;
    const b = document.body.style;
    const h = document.documentElement.style;

    // сохраняем предыдущие стили, чтобы аккуратно вернуть
    const prev = {
      bodyOverflow: b.overflow,
      htmlOverflow: h.overflow,
      bodyPosition: b.position,
      bodyTop: b.top,
      bodyWidth: b.width,
      bodyOverscroll: (b as any).overscrollBehavior as string | undefined,
    };

    // жёсткий лок скролла
    h.overflow = 'hidden';
    b.overflow = 'hidden';
    b.position = 'fixed';
    b.top = `-${scrollY}px`;
    b.width = '100%';
    (b as any).overscrollBehavior = 'none'; // предотвращаем "bounce" на iOS/Android

    return () => {
      // возвращаем всё как было
      h.overflow = prev.htmlOverflow || '';
      b.overflow = prev.bodyOverflow || '';
      b.position = prev.bodyPosition || '';
      b.top = prev.bodyTop || '';
      b.width = prev.bodyWidth || '';
      (b as any).overscrollBehavior = prev.bodyOverscroll || '';
      window.scrollTo(0, scrollY);
    };
  }, [done]);

  useEffect(() => {
    let live = true;
    const runBoot = async () => {
      const data = await bootPreload();
      if (!live) return;
      setBoot(data);
      setTimeout(() => {
        setDone(true);
        onReady(data);
      }, 250);
    };

    const locked = (() => { try { return Boolean((window as any).__exampliBootLocked); } catch { return false; } })();
    if (locked) {
      const starter = () => { window.removeEventListener('exampli:startBoot', starter as any); void runBoot(); };
      const finisher = () => {
        window.removeEventListener('exampli:finishSplash', finisher as any);
        const current = (window as any).__exampliBoot as BootData | undefined;
        const data = current || (boot as BootData | null) || null;
        if (!live) return;
        if (data) {
          setBoot(data);
          setTimeout(() => {
            setDone(true);
            onReady(data);
          }, 100);
        } else {
          // нет данных — просто скрываем сплэш без апдейта
          setDone(true);
        }
      };
      window.addEventListener('exampli:startBoot', starter as any);
      window.addEventListener('exampli:finishSplash', finisher as any);
    } else {
      void runBoot();
    }
    return () => {
      live = false;
    };
  }, [onReady]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#004aad] touch-none select-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // перестраховка: не даём wheel/touchmove чему-либо «пробиться» вниз
          onWheel={(e) => e.preventDefault()}
          onTouchMove={(e) => e.preventDefault()}
          onPointerDown={(e) => e.stopPropagation()}
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