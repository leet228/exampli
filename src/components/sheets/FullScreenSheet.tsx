import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { hapticTiny } from '../../lib/haptics';

type FullScreenSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  useTelegramBack?: boolean;
  dismissible?: boolean;
  portalTarget?: HTMLElement | null;
  sideEffects?: boolean; // управляет блокировкой скролла и TG BackButton
};

export default function FullScreenSheet({ open, onClose, title, children, useTelegramBack = true, dismissible = true, portalTarget, sideEffects = true }: FullScreenSheetProps) {
  // Telegram BackButton
  useEffect(() => {
      if (!sideEffects) return;
      const tg = (window as any)?.Telegram?.WebApp;
      if (!tg) return;
      if (open && useTelegramBack) {
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
    }, [open, onClose, useTelegramBack, sideEffects]);

  // Лочим фон
  useEffect(() => {
    if (!sideEffects) return;
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
  }, [open, sideEffects]);

  const node = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sheet-backdrop"
            onClick={dismissible ? onClose : undefined}
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

  return typeof document !== 'undefined' ? createPortal(node, (portalTarget || document.body)) : node;
}