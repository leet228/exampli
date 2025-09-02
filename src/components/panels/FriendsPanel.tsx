import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FullScreenSheet from '../sheets/FullScreenSheet';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function FriendsPanel({ open, onClose }: Props) {
  const [invitesOpen, setInvitesOpen] = useState<boolean>(false);

  return (
    <FullScreenSheet open={open} onClose={() => { setInvitesOpen(false); onClose(); }} title="Друзья">
      <div className="flex flex-col gap-3" style={{ minHeight: '60vh' }}>
        {/* Кнопка «Приглашения» */}
        <button
          type="button"
          onClick={() => setInvitesOpen(v => !v)}
          className="w-full flex items-center justify-between rounded-2xl bg-white/5 border border-white/10 px-4 py-3"
        >
          <div className="text-sm font-semibold">Приглашения</div>
          <span className="text-white/80" style={{ transform: invitesOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 160ms ease' }}>▾</span>
        </button>

        {/* Выпадающая панель приглашений — компактная, собственный скролл */}
        <AnimatePresence initial={false}>
          {invitesOpen && (
            <motion.div
              key="invites"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 280, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'tween', duration: 0.24 }}
              className="overflow-hidden"
            >
              <div className="h-[280px] rounded-2xl bg-white/5 border border-white/10 p-3 overflow-auto no-scrollbar">
                {/* TODO: список приглашений */}
                <div className="text-sm text-white/70 mb-2">Здесь будут приглашения</div>
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Приглашение #{i + 1}</div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Список друзей — без контейнера с собственным скроллом: скроллится вся панель */}
        {/* TODO: список друзей */}
        <div className="text-sm text-white/70 mb-2">Здесь будут друзья</div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Друг #{i + 1}</div>
          ))}
        </div>
      </div>
    </FullScreenSheet>
  );
}


