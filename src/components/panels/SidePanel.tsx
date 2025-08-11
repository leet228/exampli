import { AnimatePresence, motion } from 'framer-motion';
import { PropsWithChildren, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function SidePanel({
  open, onClose, title, children
}: PropsWithChildren<{ open: boolean; onClose: () => void; title?: string }>) {
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
          <motion.div className="side-backdrop" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside className="side-panel"
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <div className="side-panel-header flex items-center justify-between">
              <button className="badge" onClick={onClose}>✕ Close</button>
              <div className="text-base font-semibold">{title}</div>
              <div className="opacity-0">•</div>{/* баланс */}
            </div>
            <div className="side-panel-body">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
