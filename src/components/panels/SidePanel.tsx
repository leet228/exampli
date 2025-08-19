import { AnimatePresence, motion } from 'framer-motion';
import { PropsWithChildren, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { hapticTiny } from '../../lib/haptics';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  useTelegramBack?: boolean; // НОВОЕ
  hideLocalClose?: boolean;  // НОВОЕ
};

export default function SidePanel({ open, onClose, title, useTelegramBack, hideLocalClose, children }: PropsWithChildren<Props>) {
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    if (!open) return;
    document.body.style.overflow = 'hidden';

    // показываем системную "Назад" и перехватываем клик
    if (useTelegramBack && tg?.BackButton) {
      tg.BackButton.show();
      const handler = () => { hapticTiny(); onClose(); }; // лёгкая вибрация + закрыть панель
      tg.onEvent?.('backButtonClicked', handler);

      return () => {
        tg.offEvent?.('backButtonClicked', handler);
        tg.BackButton.hide();
        document.body.style.overflow = '';
      };
    }

    return () => { document.body.style.overflow = ''; };
  }, [open, onClose, useTelegramBack]);

  // сообщим кнопке-баннеру, что надо перемерить позицию (чтобы не прыгала)
  useEffect(() => {
    window.dispatchEvent(new Event('exampli:overlayToggled'));
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
              {hideLocalClose ? <div className="opacity-0">•</div> : (
                <button className="badge" onClick={onClose}>✕ Close</button>
              )}
              <div className="text-base font-semibold">{title}</div>
              <div className="opacity-0">•</div>
            </div>
            <div className="side-panel-body">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
