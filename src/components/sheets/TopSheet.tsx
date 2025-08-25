import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLElement>;
  title?: string;
  arrowX?: number | null; // экранная X‑координата центра кнопки‑триггера (необязательно)
  variant?: 'course' | 'streak' | 'energy'; // для статической полоски‑стрелки
};

export default function TopSheet({ open, onClose, anchor, title = '', children, arrowX, variant }: Props & { children: React.ReactNode }) {
  // во время выхода отключаем pointer-events, чтобы экран реагировал сразу
  const [interactiveBackdrop, setInteractiveBackdrop] = useState(false);
  useEffect(() => { setInteractiveBackdrop(open); }, [open]);

  const topOffset = (anchor.current?.getBoundingClientRect().bottom ?? 0) + 4;

  // позиция стрелочки относительно левого края панели (панель имеет left:12px)
  const arrowCssVar = useMemo(() => {
    if (typeof window === 'undefined') return '50%';
    const viewportX = (arrowX ?? window.innerWidth / 2);
    const clamped = Math.max(24, Math.min(window.innerWidth - 24, viewportX));
    const leftPadding = 12; // как в CSS .drop-panel
    return `${Math.round(clamped - leftPadding)}px`;
  }, [arrowX]);

  return createPortal(
    <AnimatePresence onExitComplete={() => setInteractiveBackdrop(false)}>
      {open && (
        <>
          <motion.div
            className="drop-backdrop"
            onClick={onClose}
            style={{ pointerEvents: interactiveBackdrop ? 'auto' : 'none' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: .18, ease: [0.22,1,0.36,1] }}
          />
          {/* разделительная полоса + SVG-стрелка-вырез */}
          {typeof window !== 'undefined' && (
            <motion.svg
              className="drop-divider"
              style={{ top: topOffset - 1, position: 'fixed' }}
              width="100%"
              height="12"
              viewBox={`0 0 ${window.innerWidth} 12`}
              preserveAspectRatio="none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: .2 }}
            >
              {(() => {
                const w = window.innerWidth;
                const y = 2;           // базовая высота линии
                const depth = 8;        // глубина V-изгиба
                const half = 12;        // полуширина изгиба
                let x = Math.round(w / 2);
                if (variant === 'course') x = 28;
                if (variant === 'energy') x = w - 28;
                const left = Math.max(0, x - half);
                const right = Math.min(w, x + half);
                const d = `M0,${y} H${left} L${x},${y + depth} L${right},${y} H${w}`;
                return (
                  <path
                    d={d}
                    stroke="#3b454e"
                    strokeWidth={4}
                    fill="none"
                    strokeLinejoin="miter"
                    strokeLinecap="butt"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })()}
            </motion.svg>
          )}
          <motion.div
            className="drop-panel"
            style={{ top: topOffset, willChange: 'clip-path', ['--arrow-x' as any]: arrowCssVar, zIndex: 9998 }}
            initial={{ clipPath: 'inset(0 0 100% 0)', opacity: 1 }}
            animate={{ clipPath: 'inset(0 0 0 0)', opacity: 1 }}
            exit={{ clipPath: 'inset(0 0 100% 0)', opacity: 1 }}
            transition={{ duration: .6, ease: [0.22,1,0.36,1] }}
          >
            {title ? (
              <div className="p-3 border-b border-white/10 text-center font-semibold">{title}</div>
            ) : null}
            <div className="p-3">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}