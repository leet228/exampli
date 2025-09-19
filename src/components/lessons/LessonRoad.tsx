import { motion } from 'framer-motion';
import { useMemo } from 'react';
import LessonRoundButton from './LessonRoundButton';

export type LessonNode = { id: string | number; order_index: number };

type Props = {
  lessons: LessonNode[];
  onOpen: (lessonId: string | number, anchorEl: HTMLElement | null) => void;
};

export default function LessonRoad({ lessons, onOpen }: Props) {
  const pattern = useMemo(() => {
    // Центр → влево (малый) → влево (большой) → влево (малый) → центр → вправо (малый) → вправо (большой) → вправо (малый) → центр …
    // Значения в px; можно подправить под визуал
    const small = 40;
    const big = 72;
    return [0, -small, -big, -small, 0, small, big, small, 0];
  }, []);

  const getOffsetX = (idx: number): number => pattern[idx % pattern.length];

  return (
    <div className="relative overflow-visible" style={{ paddingTop: 0 }}>
      {/* центральную вертикальную линию убрали */}

      <ul className="space-y-6 overflow-visible">
        {lessons.map((l, idx) => {
          const offsetX = getOffsetX(idx);
          return (
            <li key={l.id}>
              <div className={`flex justify-center`} style={{ overflow: 'visible' }}>
                <motion.div
                  initial={{ opacity: 0, y: 12, x: 0 }}
                  animate={{ opacity: 1, y: 0, x: offsetX }}
                  transition={{ delay: idx * 0.06 }}
                  className={`relative`}
                >
                  <LessonRoundButton
                    size={76}
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
      </ul>
    </div>
  );
}


