import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { hapticTiny } from '../../lib/haptics';


type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Не трогаем Telegram BackButton здесь, чтобы не гасить его у родительской полноэкранной панели

  // Лочим фон, чтобы не прокручивался за шторкой
  useEffect(() => {
    if (!open) return;
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    window.dispatchEvent(new Event('exampli:overlayToggled'));
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
      window.dispatchEvent(new Event('exampli:overlayToggled'));
    };
  }, [open]);

  const node = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sheet-backdrop"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ zIndex: 100 }}
          />
          <motion.div
            className="sheet-panel"
            role="dialog"
            aria-modal="true"
            ref={panelRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 600) { hapticTiny(); onClose(); }
            }}
            style={{ zIndex: 101 }}
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

  // КРИТИЧНО: рендерим в body, чтобы шторка не «прилипала» к родителям
  return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
}
