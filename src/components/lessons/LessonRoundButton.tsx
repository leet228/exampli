import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { hapticSelect } from '../../lib/haptics';

type Props = {
  size?: number; // диаметр в px
  width?: number; // ширина в px (если не указана — равна size)
  icon?: React.ReactNode;
  onClick?: (e?: React.MouseEvent<HTMLButtonElement> | React.PointerEvent<HTMLButtonElement>) => void;
  setRef?: (el: HTMLButtonElement | null) => void; // внешний ref для измерений центра
  showPulse?: boolean; // пульсирующее кольцо вокруг кнопки
  pulseColor?: string; // цвет кольца (по умолчанию baseColor)
  pulseCollapsed?: boolean; // если true — кольцо схлопнуто
  completed?: boolean; // тестовая метка «урок выполнен»: декоративные белые полосы
  baseColor?: string; // основной зелёный цвет круга
  innerIconBg?: string; // фон маленького внутреннего круга со звездой
  className?: string;
  disabled?: boolean;
  shadowHeight?: number; // высота нижней «полоски»
  dataLessonId?: string | number; // пробрасываем в data-lesson-id для поповера
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '').trim();
  if (normalized.length === 3) {
    const r = parseInt(normalized[0] + normalized[0], 16);
    const g = parseInt(normalized[1] + normalized[1], 16);
    const b = parseInt(normalized[2] + normalized[2], 16);
    return { r, g, b };
  }
  if (normalized.length === 6) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function darken(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const factor = 1 - percent / 100;
  return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
}
function rgba(hex: string, a: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.max(0, Math.min(1, a))})`;
}

export default function LessonRoundButton({
  size = 76,
  width,
  icon = '★',
  onClick,
  setRef,
  showPulse = false,
  pulseColor,
  pulseCollapsed = false,
  completed = false,
  baseColor = '#4ade3b',
  innerIconBg = '#1a7f11',
  className = '',
  disabled = false,
  shadowHeight = 6,
  dataLessonId,
}: Props) {
  const [pressed, setPressed] = useState(false);
  const shadowColor = useMemo(() => darken(baseColor, 18), [baseColor]);
  const contentColor = '#053b00';
  const hostRef = useRef<HTMLButtonElement | null>(null);
  const [inView, setInView] = useState<boolean>(true);
  const [pageVisible, setPageVisible] = useState<boolean>(true);

  const sizePx = `${size}px`;
  const widthPx = `${width ?? size}px`;
  const innerSize = Math.round(size * 0.52);
  const nudgeY = Math.max(1, Math.round(size * 0.03));
  const pulseOffsetX = Math.max(3, Math.round(size * 0.63)); // сдвиг по X (левее)
  const pulseOffsetY = Math.max(4, Math.round(size * 0.58)); // сдвиг по Y (значительно выше)

  // Следим за видимостью элемента и вкладки
  useEffect(() => {
    try {
      const el = hostRef.current;
      if (!el || typeof IntersectionObserver === 'undefined') return;
      const io = new IntersectionObserver(
        (entries) => {
          const e = entries[0];
          setInView(e?.isIntersecting ?? true);
        },
        { root: null, threshold: 0.15 }
      );
      io.observe(el);
      return () => io.disconnect();
    } catch {}
  }, []);
  useEffect(() => {
    const onVis = () => {
      try { setPageVisible(!document.hidden); } catch { setPageVisible(true); }
    };
    try { setPageVisible(!document.hidden); } catch {}
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const style: React.CSSProperties = {
    width: widthPx,
    height: sizePx,
    borderRadius: '9999px',
    background: baseColor,
    color: contentColor,
    boxShadow: pressed ? `0 0 0 ${shadowColor}` : `0 ${shadowHeight}px 0 ${shadowColor}`,
    transform: pressed ? `translateY(${shadowHeight}px)` : 'translateY(0)',
    transition: 'none',
    overflow: 'visible',
    position: 'relative',
    zIndex: 10,
  };

  return (
    <motion.button
      type="button"
      ref={(el) => { hostRef.current = el; (setRef as any)?.(el); }}
      data-lesson-id={dataLessonId as any}
      className={`grid place-items-center ${className}`}
      style={style}
      onPointerDown={() => { setPressed(true); hapticSelect(); }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
    >
      {showPulse && (pulseCollapsed || (inView && pageVisible)) && (
        <motion.div
          aria-hidden
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `calc(50% - ${pulseOffsetX}px)`,
            top: `calc(50% - ${pulseOffsetY}px)`,
            transform: 'translate(-50%, -50%)',
            width: size + 18,
            height: size + 18,
            // только полупрозрачный голубой обводочный круг, без внешнего свечения
            border: `5px solid ${rgba(pulseColor || baseColor, 1)}`,
            zIndex: 0,
          }}
          initial={{ scale: 1.06, opacity: 0.85 }}
          animate={
            pulseCollapsed
              ? { scale: 0.98, opacity: 0.45 }
              : (inView && pageVisible
                  ? { scale: [1.08, 0.96], opacity: [0.8, 0.66] }
                  : { scale: 1.02, opacity: 0.7 })
          }
          transition={
            pulseCollapsed
              ? { duration: 0.28, ease: 'easeOut' }
              : (inView && pageVisible
                  ? { duration: 1.2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }
                  : { duration: 0 })
          }
        />
      )}
      {/* Тестовая метка «урок выполнен»: диагональная пломба (ribbon) под иконкой */}
      {completed && (
        <div
          className="absolute inset-0 rounded-full overflow-hidden pointer-events-none"
          style={{ zIndex: 1 }}
          aria-hidden
        >
          <div
            className="absolute flex items-center justify-center"
            style={{
              left: -size * 0.6,
              top: size * 0.16,
              width: size * 2.2,
              height: size * 0.30,
              transform: 'rotate(-34deg)',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.10) 100%)'
            }}
          >
            {/* пустая полоса без содержимого */}
          </div>
          {/* Вторая, более тонкая и ниже расположенная полоса */}
          <div
            className="absolute"
            style={{
              left: -size * 0.6,
              top: size * 0.78, // ниже первой
              width: size * 2.2,
              height: size * 0.16, // тоньше
              transform: 'rotate(-34deg)',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 100%)'
            }}
            aria-hidden
          />
        </div>
      )}
      <span
        className="text-white font-bold"
        style={{ fontSize: Math.round(size * 0.58), lineHeight: 1, position: 'relative', top: -nudgeY, zIndex: 2, WebkitFontSmoothing: 'antialiased' as any, textRendering: 'optimizeLegibility' as any }}
      >
        {icon}
      </span>
    </motion.button>
  );
}


