// src/components/sheets/CoinSheet.tsx
import FullScreenSheet from './FullScreenSheet';

export default function CoinSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <FullScreenSheet open={open} onClose={onClose} title="Кошелёк">
      <div className="text-center text-muted py-10">
        Здесь будет кошелёк 🙂
      </div>
    </FullScreenSheet>
  );
}
