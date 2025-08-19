// lib/haptics.ts
export function hapticTiny() {
  try {
    if (typeof window === 'undefined') return;

    const tg = (window as any)?.Telegram?.WebApp?.HapticFeedback;

    // В Telegram-клиенте (iOS/Android) это даёт короткий «тычок»
    if (tg?.impactOccurred) {
      tg.impactOccurred('light');
      return;
    }
    if (tg?.selectionChanged) {
      tg.selectionChanged();
      return;
    }

    // Фолбэк для браузеров, где доступна вибрация (обычно Android)
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  } catch {
    // глушим любые ошибки окружения
  }
}
