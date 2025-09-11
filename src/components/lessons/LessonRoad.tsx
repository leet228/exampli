import { motion } from 'framer-motion';
import LessonRoundButton from './LessonRoundButton';

export type LessonNode = { id: string | number; order_index: number };

type Props = {
  lessons: LessonNode[];
  onOpen: (lessonId: string | number, anchorEl: HTMLElement | null) => void;
};

export default function LessonRoad({ lessons, onOpen }: Props) {
  return (
    <div className="relative overflow-x-hidden">
      {/* центральная вертикальная линия */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[2px] bg-white/10" />

      <ul className="space-y-10">
        {lessons.map((l, idx) => {
          return (
            <li key={l.id}>
              <div className={`flex justify-center`}>
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06 }}
                  className={`relative`}
                >
                  <LessonRoundButton
                    size={80}
                    icon={'★'}
                    baseColor="#4ade3b"
                    innerIconBg="#1a7f11"
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


