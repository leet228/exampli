// src/components/sheets/CoinSheet.tsx
import FullScreenSheet from './FullScreenSheet';
import { hapticTiny } from '../../lib/haptics';

export default function CoinSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const closeWithHaptic = () => {
    hapticTiny();
    onClose();
  };

  return (
    <FullScreenSheet open={open} onClose={closeWithHaptic} title="Кошелёк">
      {/* временный контент, иначе TS/React ругается на children */}
      <div className="text-center text-muted py-10">
        Здесь будет кошелёк 🙂
      </div>
    </FullScreenSheet>
  );
}
