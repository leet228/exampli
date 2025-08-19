import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { hapticTiny } from '../../lib/haptics';

type FullScreenSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export default function FullScreenSheet({ open, onClose, title, children }: FullScreenSheetProps) {
  // Telegram BackButton
  useEffect(() => {
      const tg = (window as any)?.Telegram?.WebApp;
      if (!tg) return;
      if (open) {
        tg.BackButton?.show?.();
        const handler = () => { 
          hapticTiny();        // ← вибрация как у обычной кнопки
          onClose(); 
        };
        tg.BackButton?.onClick?.(handler);
        return () => {
          try { tg.BackButton?.offClick?.(handler); } catch {}
          tg.BackButton?.hide?.();
        };
      }
    }, [open, onClose]);

  // Лочим фон
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
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="sheet-panel full"
            role="dialog"
            aria-modal="true"
            style={{ top: 'var(--hud-top)' }} // опускаем на высоту HUD/telegram
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            >
            {title && (
              <div className="px-5 pt-3 pb-2 border-b border-white/10 text-center font-semibold">
                {title}
              </div>
            )}
            <div className="p-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
}
