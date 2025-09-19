import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import LessonButton from './LessonButton';
import { hapticSelect } from '../../lib/haptics';
import { cacheGet, CACHE_KEYS } from '../../lib/cache';

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
  const [courseTitle, setCourseTitle] = useState<string>('');
  const [progressLabel, setProgressLabel] = useState<string>('Урок 1 из 1');
  const [baseColor, setBaseColor] = useState<string>('#3c73ff');

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

  // Синхронизация заголовка курса, цвета и «Урок X из N»
  useEffect(() => {
    if (!open) return;
    try {
      // Заголовок курса
      const code = localStorage.getItem('exampli:activeSubjectCode') || cacheGet<string>(CACHE_KEYS.activeCourseCode) || '';
      const boot: any = (window as any).__exampliBoot;
      let title = '';
      if (boot?.subjects?.length) {
        const f = (boot.subjects as any[]).find((s) => s.code === code);
        title = f?.title || '';
      }
      if (!title) {
        const all = cacheGet<any[]>(CACHE_KEYS.subjectsAll) || [];
        const f = (all as any[]).find((s) => s.code === code);
        title = f?.title || '';
      }
      setCourseTitle(title || 'Курс');

      // Цвет поповера — как в TopicsButton по циклу 1/2/3
      const palette = ['#3c73ff', '#fc86d0', '#57cc02'];
      let orderIndex: number | null = null;
      const savedOrder = localStorage.getItem('exampli:currentTopicOrder');
      if (savedOrder) orderIndex = Number(savedOrder);
      if (!orderIndex) {
        const tid = localStorage.getItem('exampli:currentTopicId');
        if (tid) {
          // попытка найти order_index из кэша тем
          let subjectId: any = null;
          const inUser = (boot?.subjects || []).find((s: any) => s.code === code);
          subjectId = inUser?.id ?? null;
          if (!subjectId) {
            const all = cacheGet<any[]>(CACHE_KEYS.subjectsAll) || [];
            subjectId = (all.find((s) => s.code === code) as any)?.id ?? null;
          }
          if (subjectId != null) {
            const cached = cacheGet<any[]>(CACHE_KEYS.topicsBySubject(subjectId)) || [];
            const found = (cached as any[]).find((t) => String(t.id) === String(tid));
            if (found?.order_index != null) orderIndex = Number(found.order_index);
          }
        }
      }
      const idx = Math.max(0, ((orderIndex || 1) - 1) % 3);
      setBaseColor(palette[idx]);

      // «Урок X из N» — X берём из order_index урока под поповером
      try {
        const tid = localStorage.getItem('exampli:currentTopicId');
        const cached = tid ? cacheGet<any[]>(CACHE_KEYS.lessonsByTopic(tid)) : null;
        const total = Array.isArray(cached) ? cached.length : 0;
        let current = 1;
        try {
          const idAttr = (anchorEl as any)?.getAttribute?.('data-lesson-id');
          const lessonId = idAttr || null;
          if (lessonId && Array.isArray(cached)) {
            const found = cached.find((l: any) => String(l.id) === String(lessonId));
            if (found?.order_index != null) current = Number(found.order_index) || 1;
          }
        } catch {}
        setProgressLabel(`Урок ${current} из ${total || 1}`);
      } catch { setProgressLabel('Урок 1 из 1'); }
    } catch {}
  }, [open]);

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
        style={{ left: arrowLeft - 12, width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderBottom: `12px solid ${baseColor}` }}
      />
      <div className="rounded-3xl" style={{ width: 340, maxWidth: '92vw', background: baseColor, color: '#ffffff', boxShadow: '0 8px 28px rgba(0,0,0,0.35)' }}>
                <div className="px-5 pt-4 pb-3">
                  <div className="text-xl font-extrabold">{courseTitle || title}</div>
                  <div className="text-base opacity-90 mt-1">{progressLabel}</div>
                </div>
                <div className="px-5 pb-5">
                  <LessonButton text="НАЧАТЬ" onClick={() => { try { hapticSelect(); } catch {} onStart(); }} baseColor="#ffffff" textColor={baseColor} shadowColorOverride="rgba(0,0,0,0.12)" />
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}


