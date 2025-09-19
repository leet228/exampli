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
            {/* отчерчивающая линия */}
            <div className="h-px w-4/5 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
          <div className="mt-4 px-5">
            {/* Текущая тема */}
            {currentTopicTitle ? (
              <div className="mb-3">
                <div className="text-xs uppercase tracking-wide opacity-70 mb-1">Текущая тема</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-semibold">
                  {currentTopicTitle}
                </div>
              </div>
            ) : null}

            {/* Следующая тема */}
            {nextTopicTitle ? (
              <div className="mb-4">
                <div className="text-xs uppercase tracking-wide opacity-70 mb-1">Следующая тема</div>
                <div className="rounded-2xl border border-white/10 px-4 py-3 font-semibold" style={{ color: '#3c73ff', background: 'rgba(60,115,255,0.08)' }}>
                  {nextTopicTitle}
                </div>
              </div>
            ) : null}

            {/* Кнопка перехода */}
            {nextTopicTitle && onNextTopic ? (
              <LessonButton
                text="Перейти на следующую тему"
                baseColor="#3c73ff"
                shadowHeight={6}
                onClick={onNextTopic}
              />
            ) : null}
          </div>
        </li>
      </ul>
    </div>
  );
}


