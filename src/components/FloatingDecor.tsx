import { useEffect, useMemo, useState } from 'react';

type Theme = 'math' | 'russian' | 'default';

const MATH = ['π','√','∞','∑','∫','≈','≤','≥','≠','×','÷','+','−','=','1','2','3','x²','sin','cos','tg'];
const RUS  = ['ё','й','ъ','ь','—','…','?','!',';','Ъ','Ы','Э','§','¶','А','Я'];

export default function FloatingDecor({ theme='default' as Theme }) {
  const [vh, setVh] = useState(0);
  useEffect(()=>{ const h = () => setVh(window.innerHeight); h(); window.addEventListener('resize', h); return ()=>window.removeEventListener('resize',h);},[]);

  const items = useMemo(() => {
    const src = theme === 'math' ? MATH : theme === 'russian' ? RUS : MATH;
    // 12 элементов, случайные позиции, но стабильные для сессии
    const rnd = (i:number) => Math.sin(i * 999) * 0.5 + 0.5;
    return Array.from({length:12}).map((_,i)=>({
      t: src[i % src.length],
      left: 8 + rnd(i) * 84,           // 8%..92%
      top:  20 + ((i*7)%60),           // 20vh..80vh
      dur: 5 + (i%6),                  // 5..10s
      delay: (i%4)*.4                  // чуть вразнобой
    }));
  }, [theme]);

  return (
    <>
      {items.map((it, i)=>(
        <div key={i}
          className="decor"
          style={{
            left: `${it.left}vw`,
            top:  `${it.top}vh`,
            fontSize: `${Math.max(16, (vh/36))}px`,
            animationDuration: `${it.dur}s`,
            animationDelay: `${it.delay}s`,
          }}>
          <small>{it.t}</small>
        </div>
      ))}
    </>
  );
}
