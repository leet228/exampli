// src/components/Splash.tsx
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { bootPreload, BootData, bootPreloadBackground } from '../lib/boot';
import { getWarmedSvg, warmupLoadSvgs } from '../lib/warmup';
import Lottie, { LottieRefCurrentProps } from 'lottie-react';

export default function Splash({ onReady, onFinish }: { onReady: (boot: BootData) => void; onFinish?: () => void }) {
  const [boot, setBoot] = useState<BootData | null>(null);
  const [done, setDone] = useState(false);
  const [phase, setPhase] = useState<string>('Подготовка…');
  const [override, setOverride] = useState<{ src: string; bg: string; title: string } | null>(null);
  // Lottie state
  const [blinkAnim, setBlinkAnim] = useState<any | null>(null);
  const [finishAnim, setFinishAnim] = useState<any | null>(null);
  const blinkRef = useRef<LottieRefCurrentProps>(null);
  const finishRef = useRef<LottieRefCurrentProps>(null);
  const [animStage, setAnimStage] = useState<'blinking' | 'finished'>('blinking');
  const [boot1Arrived, setBoot1Arrived] = useState(false);
  const [readyData, setReadyData] = useState<BootData | null>(null);
  const [finishedEnded, setFinishedEnded] = useState(false);
  const [readySent, setReadySent] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const switchScheduledRef = useRef(false);
  const closedSentRef = useRef(false);
  const closeSplash = () => {
    if (closedSentRef.current) return;
    closedSentRef.current = true;
    setDone(true);
    try { onFinish?.(); } catch {}
  };

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
    // StrictMode fix: если boot уже готов от предыдущего маунта — немедленно отдадим данные
    try {
      const existed = (window as any).__exampliBoot as BootData | undefined;
      if (existed && !readySent) {
        setReadyData(existed);
        try { onReady(existed); warmupLoadSvgs(); } catch {}
        setReadySent(true);
      }
    } catch {}
    // проверим, не попросили ли показать спец-сплэш курса
    try {
      const over = (window as any).__exampliLoadingSubject as { code?: string; title?: string } | undefined;
      if (over?.code) {
        const codeRaw = String(over.code).toLowerCase();
        const code = codeRaw.replace(/^(oge_|ege_)/, '');
        const map: Record<string, string> = {
          biology: '#a0a1a0',
          chemistry: '#625b44',
          english: '#a8a7a9',
          french: '#978c72',
          geography: '#babab9',
          german: '#bbb49d',
          history: '#dbc8a5',
          it: '#b8b6b7',
          literature: '#b4b5b5',
          math_basic: '#d2c4a0',
          math_profile: '#7e7651',
          physics: '#c2b89c',
          rus: '#60593e',
          social_science: '#c3b699',
          spanish: '#dacaac',
        };
        // код курсов у нас как в /subjects/<code>.svg, для загрузчика — <code>_load.svg с тем же кодом
        const warmed = getWarmedSvg(`/loads/${code}_load.svg`);
        const src = warmed || `/loads/${code}_load.svg`;
        const bg = map[code] || '#1E40AF';
        setOverride({ src, bg, title: over.title || 'КУРС' });
        // очистим флаг, чтобы не оставался на следующий раз
        try { (window as any).__exampliLoadingSubject = undefined; } catch {}
      }
    } catch {}
    const runBoot = async (force?: boolean) => {
      if ((window as any).__exampliBootOnce.started && !force) return;
      (window as any).__exampliBootOnce.started = true;
      const data = await bootPreload(
        (p) => {
          // boot1 завершён — поднимаем флаг, но переключимся на finished после конца текущего цикла blinking
          try { if (Number(p) >= 33) setBoot1Arrived(true); } catch {}
        },
        (label) => {
        setPhase(label || 'Загрузка…');
          // Fallback: если по какой-то причине прогресс не пришёл
          if (label === 'Курсы и иконки' || label === 'Курсы и уроки') {
            setBoot1Arrived(true);
          }
        }
      );
      if (!live) return;
      setBoot(data);
      setReadyData(data);
      // Фоновый ШАГ 2: один запрос на тяжелые данные
      try {
        const uid = (data?.user as any)?.id as string | undefined;
        const activeId = (data?.subjects?.[0]?.id as number | undefined) ?? null;
        if (uid) void bootPreloadBackground(uid, activeId);
      } catch {}
      // Отдаём данные наверх сразу, чтобы экран под сплэшем подготовился
      if (!readySent) {
        try { onReady(data); warmupLoadSvgs(); } catch {}
        setReadySent(true);
      }
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
          setDone(true);
          onReady(data);
          try { warmupLoadSvgs(); } catch {}
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

  // Грузим Lottie-анимации из public
  useEffect(() => {
    let closed = false;
    (async () => {
      try {
        const [b, f] = await Promise.all([
          fetch('/animations/blinking.json').then((r) => r.ok ? r.json() : null),
          fetch('/animations/finished_boot.json').then((r) => r.ok ? r.json() : null),
        ]);
        if (closed) return;
        if (b) setBlinkAnim(b);
        if (f) setFinishAnim(f);
      } catch {}
    })();
    return () => { closed = true; };
  }, []);

  // Ждём конца текущего цикла blinking корректно через событие lottie-web, с фолбэком по таймеру
  useEffect(() => {
    if (!boot1Arrived || animStage !== 'blinking' || switchScheduledRef.current) return;
    switchScheduledRef.current = true;
    const anim: any = (blinkRef.current as any)?.animationItem || null;
    const onLoop = () => {
      setAnimStage('finished');
      try { anim?.removeEventListener?.('loopComplete', onLoop); } catch {}
    };
    try { anim?.addEventListener?.('loopComplete', onLoop); } catch {}
    // Фолбэк: если loopComplete не придёт — переключим через 600 мс
    const t = window.setTimeout(() => {
      setAnimStage((st) => (st === 'blinking' ? 'finished' : st));
      try { anim?.removeEventListener?.('loopComplete', onLoop); } catch {}
    }, 600);
    return () => { try { window.clearTimeout(t); anim?.removeEventListener?.('loopComplete', onLoop); } catch {} };
  }, [boot1Arrived, animStage]);

  // Корректно ловим завершение finished через lottie-web (complete)
  useEffect(() => {
    if (animStage !== 'finished') return;
    const anim: any = (finishRef.current as any)?.animationItem || null;
    const onComplete = () => {
      // отдадим данные и закроем сплэш
      if (readyData && !readySent) {
        try { onReady(readyData); warmupLoadSvgs(); } catch {}
        setReadySent(true);
      }
      setDone(true);
      try { onFinish?.(); } catch {}
      try { anim?.removeEventListener?.('complete', onComplete); } catch {}
    };
    try { anim?.addEventListener?.('complete', onComplete); } catch {}
    return () => { try { anim?.removeEventListener?.('complete', onComplete); } catch {} };
  }, [animStage]);

  // Если финальная анимация закончилась и есть данные — отдаем данные наверх
  useEffect(() => {
    if (finishedEnded && readyData && !readySent) {
      try { onReady(readyData); warmupLoadSvgs(); } catch {}
      setReadySent(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedEnded, readyData]);

  // Закрытие управляется только radial‑reveal (ниже)

  // Fail‑safe: если onComplete не сработал, закроем после расчётной длительности
  useEffect(() => {
    if (animStage === 'finished' && finishAnim) {
      try { if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current); } catch {}
      const fr = Number((finishAnim?.fr as any) || 30);
      const op = Number((finishAnim?.op as any) || 60);
      const ms = Math.max(300, Math.min(8000, Math.round((op / fr) * 1000)));
      try { closeTimerRef.current = window.setTimeout(() => setFinishedEnded(true), ms + 80) as unknown as number; } catch {}
      return () => { try { if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current); } catch {} };
    }
    return () => {};
  }, [animStage, finishAnim]);

  // Удалён radial-reveal: закрываем сразу по завершению finished

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-center justify-center touch-none select-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            background: (override?.bg || '#1E40AF')
          }}
          onWheel={(e) => e.preventDefault()}
          onTouchMove={(e) => e.preventDefault()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {override ? (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <img src={override.src} alt="loading" className="w-[72%] max-w-[560px] h-auto object-contain" draggable={false} />
              <div className="mt-4 font-extrabold text-white text-lg">
                {`"${override.title}" грузится...`}
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {blinkAnim && finishAnim ? (
                animStage === 'blinking' ? (
                  <Lottie
                    lottieRef={blinkRef}
                    animationData={blinkAnim}
                    loop
                    autoplay
                    renderer={("canvas" as unknown) as any}
                    rendererSettings={({ clearCanvas: true, progressiveLoad: true } as unknown) as any}
                    style={{ width: '100%', height: '100%', contain: 'layout paint size', willChange: 'transform, opacity' }}
                    // onLoopComplete не везде срабатывает у обёртки: продублировано хуком выше
                  />
                ) : (
                  (
                    <Lottie
                      lottieRef={finishRef}
                      animationData={finishAnim}
                      loop={false}
                      autoplay
                      renderer={("canvas" as unknown) as any}
                      rendererSettings={({ clearCanvas: true, progressiveLoad: true } as unknown) as any}
                      style={{ width: '100%', height: '100%', contain: 'layout paint size', willChange: 'transform, opacity' }}
                      onComplete={() => {
                        if (readyData && !readySent) {
                          try { onReady(readyData); warmupLoadSvgs(); } catch {}
                          setReadySent(true);
                        }
                        setDone(true);
                        try { onFinish?.(); } catch {}
                      }}
                      onError={() => {
                        // fallback: если анимация не стартанула, закрываем
                        if (readyData && !readySent) {
                          try { onReady(readyData); warmupLoadSvgs(); } catch {}
                          setReadySent(true);
                        }
                        setDone(true);
                        try { onFinish?.(); } catch {}
                      }}
                    />
                  )
                )
              ) : null}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}