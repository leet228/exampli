import { motion } from 'framer-motion';
import { useMemo } from 'react';
import LessonRoundButton from './LessonRoundButton';
import LessonButton from './LessonButton';

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
    return [0, -small, -big, -small, 0, small, big, small, 0];
  }, []);
  const getOffsetX = (idx: number): number => pattern[idx % pattern.length];

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
          return (
            <li key={l.id} style={{ marginTop: gapPx }}>
              <div className={`flex justify-center`} style={{ overflow: 'visible' }}>
                <motion.div
                  initial={{ opacity: 0, y: 12, x: 0 }}
                  animate={{ opacity: 1, y: 0, x: offsetX }}
                  transition={{ delay: idx * 0.06 }}
                  className={`relative`}
                >
                  <LessonRoundButton
                    size={70}
                    icon={'★'}
                    baseColor="#3c73ff"
                    innerIconBg="#2b57e6"
                    onClick={(e?: any) => onOpen(l.id, (e?.currentTarget as HTMLElement) ?? undefined)}
                  />
                </motion.div>
              </div>
            </li>
          );
        })}

        {/* Финальный блок под последним уроком */}
        <li style={{ marginTop: 24 }}>
          <div className="flex justify-center">
            {/* чёткая разделительная линия на всю ширину экрана */}
            <div
              className="h-[2px] bg-white/10"
              style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)', marginRight: 'calc(50% - 50vw)' }}
            />
          </div>

          <div className="mt-5 px-5 text-center">
            {/* Пилюля с текущей темой */}
            {currentTopicTitle ? (
              <div className="mb-4 flex justify-center">
                <div
                  className="inline-flex rounded-xl px-3 py-1 text-[12px] font-extrabold uppercase tracking-[0.08em]"
                  style={{ color: '#3c73ff', background: 'rgba(255,255,255,0.06)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)' }}
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
                    baseColor="#3c73ff"
                    shadowHeight={6}
                    onClick={onNextTopic}
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


