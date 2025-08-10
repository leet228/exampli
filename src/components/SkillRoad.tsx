import { motion } from 'framer-motion';

export default function SkillRoad({
  items,
}: { items: { id: string; title: string; subtitle?: string }[] }) {
  return (
    <div className="relative overflow-x-hidden">
      {/* центральная вертикальная линия */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[2px] bg-white/10" />
      <ul className="space-y-10">
        {items.map((it, idx) => {
          const left = idx % 2 === 0;
          return (
            <li key={it.id} className="relative">
              <div className={`flex ${left ? 'justify-start' : 'justify-end'}`}>
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`max-w-[86%] ${left ? 'pr-8' : 'pl-8'}`}
                >
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
                </motion.div>
              </div>

              {/* звезда строго по центру, внутри своего элемента => нет оверфлоу */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                              w-10 h-10 rounded-full bg-[#ef72d6] text-white grid place-items-center
                              shadow-soft border-4 border-[color:var(--bg)]">
                ★
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}