import { motion } from 'framer-motion';
import LessonRoundButton from './LessonRoundButton';

export type LessonNode = { id: string | number; order_index: number };

type Props = {
  lessons: LessonNode[];
  onOpen: (lessonId: string | number, anchorEl: HTMLElement | null) => void;
};

export default function LessonRoad({ lessons, onOpen }: Props) {
  return (
    <div className="relative overflow-visible">
      {/* центральную вертикальную линию убрали */}

      <ul className="space-y-10 overflow-visible">
        {lessons.map((l, idx) => {
          return (
            <li key={l.id}>
              <div className={`flex justify-center`} style={{ overflow: 'visible' }}>
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06 }}
                  className={`relative`}
                >
                  <LessonRoundButton
                    size={68}
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


