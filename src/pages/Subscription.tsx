import { motion } from 'framer-motion';

export default function Subscription() {
  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl p-5 border border-white/10 shadow-soft"
        style={{
          background:
            'linear-gradient(135deg, rgba(236,72,153,.25), rgba(99,102,241,.25))',
        }}
      >
        <div className="text-2xl font-extrabold flex items-center gap-2">
          💎 Exampli Super
        </div>
        <div className="text-sm text-muted mt-1">
          Безлимит ⚡ энергии, красивые темы и поддержка проекта.
        </div>

        <div className="mt-4 grid gap-2">
          <div className="card flex items-center gap-3">
            <span>⚡</span> <span>Энергия без ограничений</span>
          </div>
          <div className="card flex items-center gap-3">
            <span>🔥</span> <span>Сохраняем стрик даже при ошибках</span>
          </div>
          <div className="card flex items-center gap-3">
            <span>🎨</span> <span>Тема «Супер» и иконки</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <button className="btn w-full" onClick={() => alert('Тестовый период скоро 😉')}>
            Попробовать 7 дней бесплатно
          </button>
          <button className="btn-outline w-full" onClick={() => alert('Покупка скоро')}>
            1 месяц — 299 ₽
          </button>
        </div>
      </motion.div>

      <div className="text-xs text-muted text-center">
        Оплата и биллинг появятся позже. Сейчас это демо-экран.
      </div>
    </div>
  );
}