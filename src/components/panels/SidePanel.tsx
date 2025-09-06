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

  // Всегда монтируем разметку, а видимость переключаем через CSS и анимации
  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <motion.div className="side-backdrop" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
        )}
      </AnimatePresence>
      <motion.aside className="side-panel"
        initial={false}
        animate={{ x: open ? 0 : '-100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{ pointerEvents: open ? 'auto' : 'none' }}
      >
        <div className="side-panel-header flex items-center justify-between">
          {hideLocalClose ? <div className="opacity-0">•</div> : (
            <button className="badge" onClick={onClose}>✕ Close</button>
          )}
          <div className="text-base font-semibold">{title}</div>
          <div className="opacity-0">•</div>
        </div>
        <div className="side-panel-body" style={{ overscrollBehavior: 'contain' }}>{children}</div>
      </motion.aside>
    </>,
    document.body
  );
}
