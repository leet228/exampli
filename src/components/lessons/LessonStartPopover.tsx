import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import LessonButton from './LessonButton';

type Props = {
  open: boolean;
  anchorEl: HTMLElement | null;
  title?: string;
  onClose: () => void;
  onStart: () => void;
};

export default function LessonStartPopover({ open, anchorEl, title = 'Урок', onClose, onStart }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [top, setTop] = useState<number>(0);
  const [left, setLeft] = useState<number>(0);
  const [arrowLeft, setArrowLeft] = useState<number>(0);

  // вычисляем позицию под кнопкой урока и положение стрелки, не вылезая за экран
  useEffect(() => {
    if (!open || !anchorEl) return;
    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const desiredTop = Math.round(rect.bottom + 10);
      setTop(desiredTop);
      const width = 340; // фиксированная ширина панели
      const vpW = window.innerWidth;
      const pad = 12; // поля по краям экрана
      const center = rect.left + rect.width / 2;
      const leftClamped = Math.max(pad, Math.min(vpW - pad - width, Math.round(center - width / 2)));
      setLeft(leftClamped);
      // положение стрелки внутри панели
      const arrow = Math.max(16, Math.min(width - 16, Math.round(center - leftClamped)));
      setArrowLeft(arrow);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update as any); };
  }, [open, anchorEl]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* клики вне панели — закрываем; фон полностью прозрачный */}
          <motion.div
            className="fixed inset-0 z-[70]"
            style={{ background: 'transparent' }}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            ref={panelRef}
            className="fixed z-[71]"
            style={{ top, left }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* стрелка */}
            <div className="relative">
              <div
                aria-hidden
                className="absolute -top-3"
                style={{ left: arrowLeft - 12, width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderBottom: '12px solid #4ade3b' }}
              />
              <div className="rounded-3xl" style={{ width: 340, maxWidth: '92vw', background: '#4ade3b', color: '#053b00', boxShadow: '0 8px 28px rgba(0,0,0,0.35)' }}>
                <div className="px-5 pt-4 pb-3">
                  <div className="text-xl font-extrabold">{title}</div>
                  <div className="text-base opacity-90 mt-1">Лекция 1 из 4</div>
                </div>
                <div className="px-5 pb-5">
                  <LessonButton text="НАЧАТЬ +20 XP" onClick={onStart} baseColor="#4ade3b" />
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}


