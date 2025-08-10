import { AnimatePresence, motion } from 'framer-motion';
import { PropsWithChildren, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function BottomSheet({
  open, onClose, title, children
}: PropsWithChildren<{ open: boolean; onClose: () => void; title?: string }>) {
  // блокируем скролл фона, пока открыта шторка
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
          <motion.div
            className="sheet-backdrop"
            style={{ zIndex: 50 }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="sheet-panel"
            style={{ zIndex: 50, paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <div className="sheet-handle" />
            {title && <div className="px-5 pb-2 text-lg font-semibold">{title}</div>}
            <div className="px-5 pb-6">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}