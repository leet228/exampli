import { motion } from 'framer-motion';

export default function SkillRoad({ items }: { items: { id: string; title: string; subtitle?: string }[] }){
  return (
    <div className="relative">
      {/* вертикальная линия */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1 bg-white/5 rounded-full" />
      <div className="flex flex-col gap-8">
        {items.map((it, idx) => {
          const side = idx % 2 === 0 ? 'left' : 'right';
          return (
            <motion.div key={it.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
              className={`relative flex ${side==='left' ? 'justify-start' : 'justify-end'}`}>
              <div className="w-1/2" />
              <div className={`w-1/2 ${side==='left' ? '-order-1 pr-6' : 'pl-6'}`}>
                <div className="skill">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{it.title}</div>
                      {it.subtitle && <div className="text-xs text-muted">{it.subtitle}</div>}
                    </div>
                    <button className="btn px-4 py-2">Учиться</button>
                  </div>
                </div>
              </div>
              {/* узел на линии */}
              <div className="absolute left-1/2 -translate-x-1/2 -top-3 w-12 h-12 rounded-full bg-[#ef72d6] shadow-soft border-4 border-[color:var(--bg)] grid place-items-center text-white text-xl">★</div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}