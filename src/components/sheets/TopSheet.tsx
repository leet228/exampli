import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLElement>;
  title?: string;
  arrowX?: number | null; // экранная X‑координата центра кнопки‑триггера
};

export default function TopSheet({ open, onClose, anchor, title = '', children, arrowX }: Props & { children: React.ReactNode }) {
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
          <motion.div
            className="drop-panel"
            style={{ top: topOffset, willChange: 'transform', ['--arrow-x' as any]: arrowCssVar, zIndex: 9999 }}
            initial={{ y: -24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -16, opacity: 0, scale: 0.98 }}
            transition={{ duration: .4, ease: [0.22,1,0.36,1] }}
          >
            <div className="p-3 border-b border-white/10 text-center font-semibold">{title}</div>
            <div className="p-3">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}