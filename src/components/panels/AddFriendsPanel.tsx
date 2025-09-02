import FullScreenSheet from '../sheets/FullScreenSheet';

type Props = { open: boolean; onClose: () => void };

export default function AddFriendsPanel({ open, onClose }: Props) {
  return (
    <FullScreenSheet open={open} onClose={onClose} title="Найди друзей">
      <div className="flex flex-col gap-3">
        {/* Поиск по имени */}
        <button
          type="button"
          className="w-full flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3"
        >
          <img src="/friends/loupe.svg" alt="Поиск" className="w-10 h-10" />
          <div className="text-left">
            <div className="text-base font-semibold">Поиск по имени</div>
          </div>
        </button>

        {/* Поделиться ссылкой */}
        <button
          type="button"
          className="w-full flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3"
        >
          <img src="/friends/plane.svg" alt="Поделиться" className="w-10 h-10" />
          <div className="text-left">
            <div className="text-base font-semibold">Поделиться ссылкой</div>
          </div>
        </button>
      </div>
    </FullScreenSheet>
  );
}


