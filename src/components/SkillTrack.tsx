import { motion } from 'framer-motion';

export type Skill = {
  id: string;
  title: string;
  icon: string;
  color: string; // heх
  progress?: number; // 0..1
};

export default function SkillTrack({ skills }: { skills: Skill[] }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {skills.map((s, i) => (
        <motion.div
          key={s.id}
          className="skill"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))' }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-2xl" style={{ filter: 'drop-shadow(0 6px 16px rgba(59,130,246,0.35))' }}>{s.icon}</div>
              <div>
                <div className="font-semibold">{s.title}</div>
                <div className="text-xs text-muted">Навык {i + 1}</div>
              </div>
            </div>
            <button className="btn px-4 py-2">Учиться</button>
          </div>
          <div className="mt-4 h-2 w-full rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.round((s.progress ?? 0) * 100)}%`, background: 'linear-gradient(90deg, #60a5fa, #38bdf8)'}} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}