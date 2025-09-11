import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { hapticSelect } from '../../lib/haptics';

type Props = {
  size?: number; // диаметр в px
  icon?: React.ReactNode;
  onClick?: (e?: React.MouseEvent<HTMLButtonElement> | React.PointerEvent<HTMLButtonElement>) => void;
  baseColor?: string; // основной зелёный цвет круга
  innerIconBg?: string; // фон маленького внутреннего круга со звездой
  className?: string;
  disabled?: boolean;
  shadowHeight?: number; // высота нижней «полоски»
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

export default function LessonRoundButton({
  size = 76,
  icon = '★',
  onClick,
  baseColor = '#4ade3b',
  innerIconBg = '#1a7f11',
  className = '',
  disabled = false,
  shadowHeight = 6,
}: Props) {
  const [pressed, setPressed] = useState(false);
  const shadowColor = useMemo(() => darken(baseColor, 18), [baseColor]);
  const contentColor = '#053b00';

  const sizePx = `${size}px`;
  const innerSize = Math.round(size * 0.52);

  const style: React.CSSProperties = {
    width: sizePx,
    height: sizePx,
    borderRadius: '9999px',
    background: baseColor,
    color: contentColor,
    boxShadow: pressed ? `0 0 0 ${shadowColor}` : `0 ${shadowHeight}px 0 ${shadowColor}`,
    transform: pressed ? `translateY(${shadowHeight}px)` : 'translateY(0)',
    transition: 'none',
    overflow: 'visible',
    position: 'relative',
    zIndex: 200,
  };

  return (
    <motion.button
      type="button"
      className={`grid place-items-center border border-white/10 ${className}`}
      style={style}
      onPointerDown={() => { setPressed(true); hapticSelect(); }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
    >
      <div
        className="grid place-items-center rounded-full text-white font-bold"
        style={{ width: innerSize, height: innerSize, background: innerIconBg }}
      >
        {icon}
      </div>
    </motion.button>
  );
}


