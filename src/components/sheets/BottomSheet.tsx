import { AnimatePresence, motion } from 'framer-motion';
import { PropsWithChildren } from 'react';

export default function BottomSheet({ open, onClose, title, children }: PropsWithChildren<{ open: boolean; onClose: () => void; title?: string }>) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div className="sheet-panel" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}>
            <div className="sheet-handle" />
            {title && <div className="px-5 pb-2 text-lg font-semibold">{title}</div>}
            <div className="px-5 pb-6">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}