import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

type LessonButtonProps = {
  text: string;
  onClick?: () => void;
  /** Основной цвет кнопки. По умолчанию зелёный как в поповере */
  baseColor?: string;
  /** Высота «нижней полоски» (px) */
  shadowHeight?: number;
  className?: string;
  disabled?: boolean;
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

export default function LessonButton({
  text,
  onClick,
  baseColor = '#4ade3b',
  shadowHeight = 6,
  className = '',
  disabled = false,
}: LessonButtonProps) {
  const [pressed, setPressed] = useState(false);

  const shadowColor = useMemo(() => darken(baseColor, 18), [baseColor]);
  const textColor = useMemo(() => {
    // Контрастная тёмная надпись для светло-зелёной кнопки
    return '#053b00';
  }, []);

  const baseStyle: React.CSSProperties = {
    backgroundColor: baseColor,
    color: textColor,
    borderRadius: 20,
    // «Нижняя полоска», повторяющая форму кнопки
    boxShadow: pressed ? `0 0 0 ${shadowColor}` : `0 ${shadowHeight}px 0 ${shadowColor}`,
    transform: pressed ? `translateY(${shadowHeight}px)` : 'translateY(0)',
    // Мгновенное переключение без анимации
    transition: 'none',
  };

  return (
    <motion.button
      type="button"
      className={`w-full select-none font-extrabold text-lg py-3 px-4 active:cursor-grabbing ${className}`}
      style={baseStyle}
      whileTap={{}}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
    >
      {text}
    </motion.button>
  );
}


