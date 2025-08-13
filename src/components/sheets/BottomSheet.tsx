import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    if (!tg) return;

    if (open) {
      tg.BackButton?.show();
      const handler = () => onClose();
      tg.BackButton?.onClick(handler);
      return () => {
        tg.BackButton?.hide();
        tg.BackButton?.offClick?.(handler);
      };
    }
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sheet-backdrop"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="sheet-panel"
            role="dialog"
            aria-modal="true"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          >
            {title ? (
              <div className="px-5 pt-3 pb-2 border-b border-white/10">
                <div className="sheet-handle" />
                <div className="text-center font-semibold">{title}</div>
              </div>
            ) : (
              <div className="sheet-handle" />
            )}
            <div className="p-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
