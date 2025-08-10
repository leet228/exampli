import { motion } from 'framer-motion';

export default function SkillRoad({
  items,
}: { items: { id: string; title: string; subtitle?: string }[] }) {
  return (
    <div className="relative overflow-x-hidden">
      <div className="grid grid-cols-[1fr_2px_1fr] gap-x-6">
        {/* вертикальная линия */}
        <div className="col-start-2 row-span-full bg-white/10 rounded-full" />

        {items.map((it, idx) => {
          const left = idx % 2 === 0;
          return (
            <motion.div
              key={it.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`${left ? 'col-start-1' : 'col-start-3'} mb-8`}
            >
              <div className="relative max-w-[86%]">
                <div className="skill">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{it.title}</div>
                      {it.subtitle && (
                        <div className="text-xs text-muted truncate">{it.subtitle}</div>
                      )}
                    </div>
                    <button className="btn px-4 py-2 shrink-0">Учиться</button>
                  </div>
                </div>
                {/* узел-звезда, центр по линии */}
                <div className="absolute left-[calc(100%+3rem)] top-1/2 -translate-y-1/2 -translate-x-1/2
                                w-10 h-10 rounded-full bg-[#ef72d6] grid place-items-center text-white text-base shadow-soft
                                border-4 border-[color:var(--bg)]"
                     style={{ left: left ? 'calc(100% + 3rem)' : 'calc(-3rem)' }}>
                  ★
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}