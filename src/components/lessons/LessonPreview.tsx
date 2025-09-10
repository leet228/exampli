import { motion, AnimatePresence } from 'framer-motion';

export default function LessonPreview({ open, onClose, title = 'Урок', onStart }: { open: boolean; onClose: () => void; title?: string; onStart: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="sheet-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            className="sheet-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-4 pb-3 border-b border-white/10 text-center font-semibold">{title}</div>
            <div className="p-4">
              <div className="card text-left">
                <div className="text-base">Лекция 1 из 4</div>
                <div className="text-sm text-muted mt-1">Нажми «Начать», чтобы приступить</div>
                <button type="button" className="btn w-full mt-4" onClick={onStart}>НАЧАТЬ +20 XP</button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}


