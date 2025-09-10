import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

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
  const [arrowLeft, setArrowLeft] = useState<number>(0);

  // вычисляем позицию под кнопкой урока и положение стрелки
  useEffect(() => {
    if (!open || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const vpW = window.innerWidth;
    const pad = 12;
    const desiredTop = Math.round(rect.bottom + 10);
    setTop(desiredTop);
    // стрелка: после рендера узнаем левую границу панели
    const id = requestAnimationFrame(() => {
      const p = panelRef.current;
      if (!p) return;
      const pr = p.getBoundingClientRect();
      const x = Math.max(16, Math.min(pr.width - 16, rect.left + rect.width / 2 - pr.left));
      setArrowLeft(x);
    });
    return () => cancelAnimationFrame(id);
  }, [open, anchorEl]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[70]"
            style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            ref={panelRef}
            className="fixed left-3 right-3 z-[71]"
            style={{ top }}
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
              <div className="rounded-3xl" style={{ background: '#4ade3b', color: '#053b00', boxShadow: '0 8px 28px rgba(0,0,0,0.35)' }}>
                <div className="px-5 pt-4 pb-3">
                  <div className="text-xl font-extrabold">{title}</div>
                  <div className="text-base opacity-90 mt-1">Лекция 1 из 4</div>
                </div>
                <div className="px-5 pb-5">
                  <button
                    type="button"
                    onClick={onStart}
                    className="w-full rounded-[20px] bg-white text-[#169c15] font-extrabold text-lg py-3"
                    style={{ boxShadow: '0 6px 0 rgba(0,0,0,0.12)' }}
                  >
                    НАЧАТЬ +20 XP
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}


