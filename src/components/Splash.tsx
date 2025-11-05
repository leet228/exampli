// src/components/Splash.tsx
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { bootPreload, BootData, bootPreloadBackground } from '../lib/boot';
import { getWarmedSvg, warmupLoadSvgs } from '../lib/warmup';

export default function Splash({ onReady }: { onReady: (boot: BootData) => void }) {
  const [boot, setBoot] = useState<BootData | null>(null);
  const [done, setDone] = useState(false);
  const [phase, setPhase] = useState<string>('Подготовка…');
  const [override, setOverride] = useState<{ src: string; bg: string; title: string } | null>(null);

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
    // Глобальный предохранитель от двойного запуска boot (StrictMode/двойной маунт)
    // module-scope переменная
    (window as any).__exampliBootOnce = (window as any).__exampliBootOnce || { started: false };
    // проверим, не попросили ли показать спец-сплэш курса
    try {
      const over = (window as any).__exampliLoadingSubject as { code?: string; title?: string } | undefined;
      if (over?.code) {
        const codeRaw = String(over.code).toLowerCase();
        const code = codeRaw.replace(/^(oge_|ege_)/, '');
        const map: Record<string, string> = {};
        // код курсов у нас как в /subjects/<code>.svg, для загрузчика — <code>_load1.svg с тем же кодом
        const warmed = getWarmedSvg(`/loads/${code}_load1.svg`);
        const src = warmed || `/loads/${code}_load1.svg`;
        const bg = '#0a111d';
        setOverride({ src, bg, title: over.title || 'КУРС' });
        // очистим флаг, чтобы не оставался на следующий раз
        try { (window as any).__exampliLoadingSubject = undefined; } catch {}
      }
    } catch {}
    const runBoot = async (force?: boolean) => {
      if ((window as any).__exampliBootOnce.started && !force) return;
      (window as any).__exampliBootOnce.started = true;
      const data = await bootPreload(undefined, (label) => setPhase(label || 'Загрузка…'));
      if (!live) return;
      setBoot(data);
      setTimeout(() => {
        setDone(true);
        onReady(data);
        try { warmupLoadSvgs(); } catch {}
      }, 100);
      // Фоновый ШАГ 2: один запрос на тяжелые данные
      try { const uid = (data?.user as any)?.id as string | undefined; const activeId = (data?.subjects?.[0]?.id as number | undefined) ?? null; if (uid) void bootPreloadBackground(uid, activeId); } catch {}
    };

    const locked = (() => { try { return Boolean((window as any).__exampliBootLocked); } catch { return false; } })();
    if (locked) {
      const starter = () => { window.removeEventListener('exampli:startBoot', starter as any); void runBoot(true); };
      const finisher = () => {
        window.removeEventListener('exampli:finishSplash', finisher as any);
        // Разрешим следующий управляемый запуск boot после завершения онбординга
        try { (window as any).__exampliBootOnce.started = false; } catch {}
        const current = (window as any).__exampliBoot as BootData | undefined;
        const data = current || (boot as BootData | null) || null;
        if (!live) return;
        if (data) {
          setBoot(data);
          setTimeout(() => {
            setDone(true);
            onReady(data);
            try { warmupLoadSvgs(); } catch {}
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
          className="fixed inset-0 z-[1000] flex items-center justify-center touch-none select-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ background: override?.bg || '#0049b7' }}
          onWheel={(e) => e.preventDefault()}
          onTouchMove={(e) => e.preventDefault()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {override ? (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <img src={override.src} alt="loading" className="w-[72%] max-w-[560px] h-auto object-contain" draggable={false} loading="eager" fetchPriority="high" />
              <div className="mt-4 font-extrabold text-white text-lg">
                {`"${override.title}" грузится...`}
              </div>
            </div>
          ) : (
            <img
              src="/kursik2.svg"
              alt="Загрузка"
              className="w-full h-full object-contain"
              draggable={false}
              loading="eager"
              fetchPriority="high"
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}