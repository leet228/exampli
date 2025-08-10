import { AnimatePresence, motion } from 'framer-motion';
import { PropsWithChildren, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLElement>; // ref на контейнер HUD
  title?: string;
};

export default function TopSheet({ open, onClose, anchor, title, children }: PropsWithChildren<Props>) {
  const [top, setTop] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const el = anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // позиционируем прямо под HUD (+8px зазор)
    setTop(r.bottom + 8 + window.scrollY);
  }, [open, anchor]);

  // блокируем скролл, пока открыта шторка
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="drop-backdrop" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div ref={panelRef} className="drop-panel"
            style={{ top }}
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            {title && <div className="px-5 pt-3 pb-2 text-lg font-semibold">{title}</div>}
            <div className="px-5 pb-5">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
