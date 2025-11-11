import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import LessonRoundButton from './LessonRoundButton';
import LessonButton from './LessonButton';
import { hapticSelect } from '../../lib/haptics';
import { cacheGet, CACHE_KEYS } from '../../lib/cache';

export type LessonNode = { id: string | number; order_index: number };

type Props = {
  lessons: LessonNode[];
  onOpen: (lessonId: string | number, anchorEl: HTMLElement | null) => void;
  currentTopicTitle?: string | null;
  nextTopicTitle?: string | null;
  onNextTopic?: () => void;
};

export default function LessonRoad({ lessons, onOpen, currentTopicTitle, nextTopicTitle, onNextTopic }: Props) {
  // Горизонтальные смещения
  const small = 40;
  const big = 58;
  const pattern = useMemo(() => {
    // Центр → влево(мал) → влево(больш) → влево(мал) → центр → вправо(мал) → вправо(больш) → вправо(мал) → центр …
    // Убрали последний 0, чтобы паттерн повторялся корректно (урок 9 и 10 не будут оба в центре)
    return [0, -small, -big, -small, 0, small, big, small];
  }, []);
  const getOffsetX = (idx: number): number => pattern[idx % pattern.length];

  // Получаем код активного курса для картинок
  const courseCode = useMemo(() => {
    try {
      const code = localStorage.getItem('exampli:activeSubjectCode') || cacheGet<string>(CACHE_KEYS.activeCourseCode) || '';
      // Преобразуем код курса в имя файла (убираем префиксы ege_, oge_ и делаем lowercase)
      return code.replace(/^(oge_|ege_)/, '').toLowerCase();
    } catch {
      return '';
    }
  }, [lessons?.length]);

  // Функция для определения, нужно ли показывать картинку после урока
  const shouldShowImage = (lessonIdx: number): { show: boolean; imageNum: number; side: 'right' | 'left' } => {
    // Картинка 1 вправо: после уроков 2 (3-й), 10 (11-й), 18 (19-й), 26 (27-й)... (idx = 2 + 8*n)
    // Картинка 2 влево: после уроков 6 (7-й), 14 (15-й), 22 (23-й), 30 (31-й)... (idx = 6 + 8*n)
    // Паттерн повторяется каждые 8 уроков
    const cyclePos = lessonIdx % 8;
    
    if (cyclePos === 2) {
      // Картинка 1 вправо: нужна после урока 2, 10, 18... (т.е. после урока idx = 2 + 8*n)
      // Минимум уроков: если это урок idx=2, нужно 5+; если idx=10, нужно 13+; если idx=18, нужно 21+
      const cycleNum = Math.floor(lessonIdx / 8);
      const minLessons = 5 + 8 * cycleNum;
      if (lessons.length >= minLessons) {
        return { show: true, imageNum: 1, side: 'right' };
      }
    } else if (cyclePos === 6) {
      // Картинка 2 влево: нужна после урока 6, 14, 22... (т.е. после урока idx = 6 + 8*n)
      // Минимум уроков: если это урок idx=6, нужно 9+; если idx=14, нужно 17+; если idx=22, нужно 25+
      const cycleNum = Math.floor(lessonIdx / 8);
      const minLessons = 9 + 8 * cycleNum;
      if (lessons.length >= minLessons) {
        return { show: true, imageNum: 2, side: 'left' };
      }
    }
    
    return { show: false, imageNum: 0, side: 'right' };
  };

  // линия будет локальной (в ширину контейнера) с «размытием» по краям через градиент

  // Цвет узлов уроков зависит от порядка текущей темы (1 → синий, 2 → розовый, 3 → зелёный и по кругу)
  const { nodeBase, nodeInner } = useMemo(() => {
    const palette = ['#3c73ff', '#fc86d0', '#57cc02'];
    const darken = (hex: string, amount = 18) => {
      const h = hex.replace('#', '');
      const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
      const n = parseInt(full, 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount / 100))));
      return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
    };
    let orderIndex: number | null = null;
    // 1) из localStorage
    try {
      const savedId = localStorage.getItem('exampli:currentTopicId');
      const savedOrder = localStorage.getItem('exampli:currentTopicOrder');
      if (savedOrder) orderIndex = Number(savedOrder);
      if (!orderIndex && savedId) {
        // попробуем найти по списку тем активного предмета
        let subjectId: any = null;
        try {
          const boot: any = (window as any).__exampliBoot;
          const code = localStorage.getItem('exampli:activeSubjectCode') || cacheGet<string>(CACHE_KEYS.activeCourseCode) || '';
          const inUser = (boot?.subjects || []).find((s: any) => s.code === code);
          subjectId = inUser?.id ?? null;
          if (!subjectId) {
            const all = cacheGet<any[]>(CACHE_KEYS.subjectsAll) || [];
            const found = all.find((s) => s.code === code);
            subjectId = found?.id ?? null;
          }
        } catch {}
        if (subjectId != null) {
          let topics: any[] = [];
          const cached = cacheGet<any[]>(CACHE_KEYS.topicsBySubject(subjectId));
          if (cached && cached.length) topics = cached as any[];
          else {
            try {
              const boot: any = (window as any).__exampliBoot;
              topics = (boot?.topicsBySubject || {})[String(subjectId)] || [];
            } catch {}
          }
          const found = (topics || []).find((t: any) => String(t.id) === String(savedId));
          if (found?.order_index != null) orderIndex = Number(found.order_index);
        }
      }
    } catch {}
    const idx = Math.max(0, ((orderIndex || 1) - 1) % 3);
    const base = palette[idx];
    return { nodeBase: base, nodeInner: darken(base, 22) };
  }, [lessons?.length, currentTopicTitle]);

  // Подсветка первого урока: флаг схлопывания после клика (без персистенции)
  const [firstPressed, setFirstPressed] = useState<boolean>(false);
  // Реагируем на закрытие превью — возвращаем пульсацию
  useEffect(() => {
    const onPreview = (evt: Event) => {
      const e = evt as CustomEvent<{ open?: boolean }>;
      const isOpen = Boolean(e?.detail?.open);
      if (!isOpen) setFirstPressed(false);
    };
    window.addEventListener('exampli:lessonPreview', onPreview as EventListener);
    return () => window.removeEventListener('exampli:lessonPreview', onPreview as EventListener);
  }, []);

  return (
    <div className="relative overflow-visible" style={{ paddingTop: 0 }}>
      {/* центральную вертикальную линию убрали */}

      <ul className="overflow-visible">
        {lessons.map((l, idx) => {
          const offsetX = getOffsetX(idx);
          const prev = idx > 0 ? getOffsetX(idx - 1) : 0;
          const absPrev = Math.abs(prev);
          const absCurr = Math.abs(offsetX);
          const gapPx = idx === 0
            ? 0
            : (absPrev === small && absCurr === big
                ? 16 // small → big = 4
                : (absPrev === big && absCurr === small
                    ? 18 // big → small = 4.5
                    : 8)); // остальные = 2
          const imageInfo = shouldShowImage(idx);
          return (
            <li key={l.id} style={{ marginTop: gapPx, position: 'relative' }}>
              <div className={`flex justify-center`} style={{ overflow: 'visible' }}>
                <motion.div
                  initial={{ opacity: 0, y: 12, x: 0 }}
                  animate={{ opacity: 1, y: 0, x: offsetX }}
                  transition={{ delay: idx * 0.06 }}
                  className={`relative`}
                >
                  <LessonRoundButton
                    size={70}
                    width={74}
                    icon={'★'}
                    baseColor={nodeBase}
                    innerIconBg={nodeInner}
                    dataLessonId={l.id}
                    showPulse={idx === 1}
                    pulseColor={nodeBase}
                    pulseCollapsed={idx === 1 ? firstPressed : false}
                    completed={idx === 0} // тестовая отметка: первый урок отображается «выполненным»
                    onClick={(e?: any) => { if (idx === 1) setFirstPressed(true); onOpen(l.id, (e?.currentTarget as HTMLElement) ?? undefined); }}
                  />
                </motion.div>
              </div>
              {/* Картинка после урока */}
              {imageInfo.show && courseCode && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.06 + 0.3 }}
                  className="absolute"
                  style={{
                    top: '-85%',
                    left: imageInfo.side === 'right' ? 'calc(50% + 20px)' : 'auto',
                    right: imageInfo.side === 'left' ? 'calc(50% + 20px)' : 'auto',
                    transform: 'translateY(-50%)',
                    zIndex: 1,
                  }}
                >
                  <img
                    src={`/road_pic/${courseCode}${imageInfo.imageNum}0.svg`}
                    alt=""
                    className="h-auto object-contain pointer-events-none select-none"
                    style={{ width: '160px', maxWidth: '180px' }}
                    onError={(e) => {
                      // Скрываем картинку, если файл не найден
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </motion.div>
              )}
            </li>
          );
        })}

        {/* Финальный блок под последним уроком */}
        <li style={{ marginTop: 24 }}>
          {/* Разделительная линия «как было», но с мягким затуханием по краям */}
          <div className="flex justify-center px-0">
            <div
              className="h-[2px] w-full"
              style={{
                background:
                  'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.18) 10%, rgba(255,255,255,0.18) 90%, rgba(255,255,255,0) 100%)',
              }}
            />
          </div>

          <div className="mt-5 px-5 text-center">
            {/* Пилюля с текущей темой */}
            {currentTopicTitle ? (
              <div className="mb-4 flex justify-center">
                <div
                  className="inline-flex rounded-xl px-3 py-1 text-[12px] font-extrabold uppercase tracking-[0.08em]"
                  style={{ color: nodeBase, background: 'rgba(255,255,255,0.06)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)' }}
                >
                  {String(currentTopicTitle)}
                </div>
              </div>
            ) : null}

            {/* Крупный заголовок — следующая тема */}
            {nextTopicTitle ? (
              <div className="mb-6 px-2 text-white text-2xl sm:text-3xl font-extrabold leading-snug">
                {nextTopicTitle}
              </div>
            ) : null}

            {/* Кнопка перехода */}
            {nextTopicTitle && onNextTopic ? (
              <>
                {/* Широкая кнопка на всю ширину экрана с небольшими полями */}
                <div style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)', marginRight: 'calc(50% - 50vw)' }} className="px-6">
                  <LessonButton
                    text="ПЕРЕЙТИ НА СЛЕДУЮЩУЮ ТЕМУ"
                    baseColor={nodeBase}
                    shadowHeight={6}
                    onClick={() => { try { hapticSelect(); } catch {} if (onNextTopic) onNextTopic(); }}
                  />
                </div>
                {/* дополнительный большой отступ до низа */}
                <div style={{ height: 30 }} />
              </>
            ) : null}
          </div>
        </li>
      </ul>
    </div>
  );
}


