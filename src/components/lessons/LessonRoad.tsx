import { motion } from 'framer-motion';

export type LessonNode = { id: string | number; order_index: number };

type Props = {
  lessons: LessonNode[];
  onOpen: (lessonId: string | number) => void;
};

export default function LessonRoad({ lessons, onOpen }: Props) {
  return (
    <div className="relative overflow-x-hidden">
      {/* центральная вертикальная линия */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[2px] bg-white/10" />

      <ul className="space-y-10">
        {lessons.map((l, idx) => {
          const left = idx % 2 === 0;
          return (
            <li key={l.id}>
              <div className={`flex ${left ? 'justify-start' : 'justify-end'}`}>
                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06 }}
                  onClick={() => onOpen(l.id)}
                  className={`relative ${left ? 'pr-16' : 'pl-16'} group`}
                >
                  {/* Круглая кнопка со звездой */}
                  <div
                    className="w-16 h-16 rounded-full grid place-items-center bg-[#1f2b33] border border-white/10 shadow-[0_10px_24px_rgba(0,0,0,0.35)] group-active:scale-95 transition"
                    aria-label={`Урок ${idx + 1}`}
                  >
                    <div className="w-8 h-8 rounded-full grid place-items-center bg-[var(--accent)] text-white font-bold">★</div>
                  </div>
                </motion.button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}


