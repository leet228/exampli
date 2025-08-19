// lib/haptics.ts

export function hapticTiny() {
  try {
    if (typeof window === 'undefined') return;
    const tg = (window as any)?.Telegram?.WebApp?.HapticFeedback;

    if (tg?.impactOccurred) { tg.impactOccurred('light'); return; }
    if (tg?.selectionChanged) { tg.selectionChanged(); return; }
    if ('vibrate' in navigator) (navigator as any).vibrate(10);
  } catch {}
}

/**
 * Плавный «свайповый» хаптик — ощущение, что панель/список выезжает.
 * Используй при раскрытии темы, когда показываешь её подтемы.
 */
export function hapticSlideReveal() {
  try {
    if (typeof window === 'undefined') return;
    const tg = (window as any)?.Telegram?.WebApp?.HapticFeedback;

    // В Telegram: сначала мягкий удар, потом лёгкий — короткая «горбинка»
    if (tg?.impactOccurred) {
      tg.impactOccurred('soft');
      setTimeout(() => { try { tg.impactOccurred('light'); } catch {} }, 55);
      return;
    }
    if (tg?.selectionChanged) {
      tg.selectionChanged();
      setTimeout(() => { try { tg.selectionChanged(); } catch {} }, 55);
      return;
    }

    // Фолбэк в вебе/Android: ступенчатый паттерн
    if ('vibrate' in navigator) (navigator as any).vibrate([2, 8, 12]);
  } catch {}
}

/**
 * Мягкое «закрытие» (обратное ощущение). Можно дергать при сворачивании.
 */
export function hapticSlideClose() {
  try {
    if (typeof window === 'undefined') return;
    const tg = (window as any)?.Telegram?.WebApp?.HapticFeedback;

    if (tg?.impactOccurred) { tg.impactOccurred('soft'); return; }
    if (tg?.selectionChanged) { tg.selectionChanged(); return; }
    if ('vibrate' in navigator) (navigator as any).vibrate(8);
  } catch {}
}
