import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';

type Theme = 'math' | 'russian' | 'default';

const MATH = ['π','√','∞','∑','∫','≈','≤','≥','≠','×','÷','+','−','=','1','2','3','x²','sin','cos','tg','log'];
const RUS  = ['Ё','Й','Ъ','Ь','—','…','?','!',';','Ъ','Ы','Э','§','¶','А','Я','Ф','И','О','Е'];

function seedRand(seed: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    // xorshift-ish
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17; h >>>= 0;
    h ^= h << 5;  h >>>= 0;
    return (h >>> 0) / 0xffffffff;
  };
}

export default function FloatingDecor({ theme }: { theme: Theme }) {
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);

  useEffect(() => {
    const recalc = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    recalc();
    window.addEventListener('resize', recalc);
    window.addEventListener('orientationchange', recalc);
    return () => {
      window.removeEventListener('resize', recalc);
      window.removeEventListener('orientationchange', recalc);
    };
  }, []);

  // Стабильное распределение по ВСЕМУ экрану (а не только по центру)
  const items = useMemo(() => {
    const pool = theme === 'math' ? MATH : theme === 'russian' ? RUS : MATH;
    const rnd = seedRand(`exampli:${theme}`);
    const count = 28; // можно 24–36

    return Array.from({ length: count }).map((_, i) => {
      const t = pool[i % pool.length];
      const left = Math.round(rnd() * 100);   // 0..100 vw
      const top  = Math.round(rnd() * 100);   // 0..100 vh
      const scale = 0.9 + rnd() * 0.8;        // 0.9..1.7
      const dur   = 6 + Math.round(rnd() * 6); // 6..12s
      const delay = (rnd() * 1.2).toFixed(2);
      return { t, left, top, scale, dur, delay };
    });
  }, [theme]);

  // размер шрифта (адаптируется к экрану, но не огромный)
  const baseSize = Math.max(14, Math.min(18, Math.floor(Math.min(vw, vh) / 24)));

  return createPortal(
    <div className="decor-layer" aria-hidden>
      {items.map((it, idx) => (
        <div
          key={idx}
          className="decor-item"
          style={{
            left: `calc(${it.left}vw - 0.5em)`,
            top:  `calc(${it.top}vh - 0.5em)`,
            fontSize: `${baseSize * it.scale}px`,
            animationDuration: `${it.dur}s`,
            animationDelay: `${it.delay}s`,
          }}
        >
          {it.t}
        </div>
      ))}
    </div>,
    document.body
  );
}
