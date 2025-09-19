import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { cacheGet, CACHE_KEYS } from '../lib/cache';
import { hapticTiny } from '../lib/haptics';

export default function TopicsButton({ onOpen }: { onOpen: () => void }) {
  const [topicTitle, setTopicTitle] = useState<string>('Выбрать тему');
  const [pressed, setPressed] = useState(false);

  // Базовый цвет кнопки — зависит от порядка текущей темы (1/2/3)
  const baseColor = useMemo(() => {
    const palette = ['#3c73ff', '#fc86d0', '#57cc02'];
    let orderIndex: number | null = null;
    try {
      const savedOrder = localStorage.getItem('exampli:currentTopicOrder');
      if (savedOrder) orderIndex = Number(savedOrder);
      if (!orderIndex) {
        const savedId = localStorage.getItem('exampli:currentTopicId');
        if (savedId) {
          // найдём по списку тем активного предмета
          let subjectId: any = null;
          const code = localStorage.getItem('exampli:activeSubjectCode') || cacheGet<string>(CACHE_KEYS.activeCourseCode) || '';
          try {
            const boot: any = (window as any).__exampliBoot;
            const inUser = (boot?.subjects || []).find((s: any) => s.code === code);
            subjectId = inUser?.id ?? null;
            if (!subjectId) {
              const all = cacheGet<any[]>(CACHE_KEYS.subjectsAll) || [];
              const found = all.find((s) => s.code === code);
              subjectId = found?.id ?? null;
            }
            let topics: any[] = [];
            const cached = cacheGet<any[]>(CACHE_KEYS.topicsBySubject(subjectId));
            if (cached && cached.length) topics = cached as any[];
            else topics = (boot?.topicsBySubject || {})[String(subjectId)] || [];
            const found = (topics || []).find((t: any) => String(t.id) === String(savedId));
            if (found?.order_index != null) orderIndex = Number(found.order_index);
          } catch {}
        }
      }
    } catch {}
    const idx = Math.max(0, ((orderIndex || 1) - 1) % 3);
    return palette[idx];
  }, [topicTitle]);
  const shadowHeight = 6; // высота «нижней полоски» в px

  const darkColor = useMemo(() => {
    // затемняем базовый цвет на ~18%
    function hexToRgb(hex: string) {
      const h = hex.replace('#', '');
      const bigint = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return { r, g, b };
    }
    function darken(hex: string, amount = 18) {
      const { r, g, b } = hexToRgb(hex);
      const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount / 100))));
      return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
    }
    return darken(baseColor, 18);
  }, [baseColor]);

  const CUR_TOPIC_TITLE_KEY = 'exampli:currentTopicTitle';

  // слушаем обновления «бейджа» из TopicsPanel
  useEffect(() => {
    const onBadge = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.topicTitle) setTopicTitle(d.topicTitle);
      try {
        if (d.topicTitle) localStorage.setItem(CUR_TOPIC_TITLE_KEY, String(d.topicTitle));
      } catch {}
    };
    window.addEventListener('exampli:topicBadge', onBadge as EventListener);
    return () => window.removeEventListener('exampli:topicBadge', onBadge as EventListener);
  }, []);

  // первичное восстановление из локального кэша / boot
  useEffect(() => {
    try {
      const fromLsTopic = localStorage.getItem(CUR_TOPIC_TITLE_KEY);
      if (fromLsTopic) setTopicTitle(fromLsTopic);
    } catch {}

    const onBoot = (e: Event) => {
      const d: any = (e as CustomEvent).detail || {};
      const bt = d?.current_topic_title;
      if (bt) setTopicTitle(bt);
    };
    window.addEventListener('exampli:bootData', onBoot as EventListener);
    return () => window.removeEventListener('exampli:bootData', onBoot as EventListener);
  }, []);

  // При смене курса — не сбрасываем текст, но можно повторно подхватить кэш
  useEffect(() => {
    const onCourse = () => {
      try {
        const t = localStorage.getItem(CUR_TOPIC_TITLE_KEY);
        if (t) setTopicTitle(t);
      } catch {}
    };
    window.addEventListener('exampli:courseChanged', onCourse as EventListener);
    return () => window.removeEventListener('exampli:courseChanged', onCourse as EventListener);
  }, []);

  // позиционирование теперь полностью на CSS через класс .topics-hero (см. index.css)

  return (
    <motion.button
      type="button"
      className="topics-hero"
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onClick={() => { setPressed(false); hapticTiny(); onOpen(); }}
      animate={{
        y: pressed ? shadowHeight : 0,
        boxShadow: pressed ? `0px 0px 0px ${darkColor}` : `0px ${shadowHeight}px 0px ${darkColor}`,
      }}
      transition={{ duration: 0 }}
      style={{
        background: baseColor,
        // Синхронно повторяем скругление из CSS (.topics-hero)
        borderRadius: 20,
        // Перекрываем box-shadow из CSS классом inline-стилем
      }}
    >
      <div className="text-left leading-tight">
        <div className="text-[18px] font-extrabold leading-tight">{topicTitle}</div>
      </div>
      <span className="ml-2 text-[18px] opacity-90">▾</span>
    </motion.button>
  );
}
