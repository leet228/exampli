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
 * Используй при раскрытии или выборе темы.
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

export function hapticSelect() {
  try {
    if (typeof window === 'undefined') return;
    const tg = (window as any)?.Telegram?.WebApp?.HapticFeedback;

    // В Telegram / iOS — нативный selection
    if (tg?.selectionChanged) { tg.selectionChanged(); return; }

    // Альтернатива: один «средний» удар, похожий по ощущению
    if (tg?.impactOccurred) { tg.impactOccurred('medium'); return; }

    // Фолбэк для веба (Android vibration API)
    if ('vibrate' in navigator) (navigator as any).vibrate([12]);
  } catch {}
}

/**
 * Микро-хаптики во время «печати» — короткие едва заметные тики.
 * Вызывай с интервалом 120–200мс во время стриминга текста.
 */
export function hapticTypingTick() {
  try {
    if (typeof window === 'undefined') return;
    const tg = (window as any)?.Telegram?.WebApp?.HapticFeedback;

    // Очень лёгкий «soft», чтобы не раздражал
    if (tg?.impactOccurred) { tg.impactOccurred('soft'); return; }
    if (tg?.selectionChanged) { tg.selectionChanged(); return; }
    if ('vibrate' in navigator) (navigator as any).vibrate(5);
  } catch {}
}

// Уведомления «успех/ошибка» для подтверждения ответа
export function hapticSuccess() {
  try {
    if (typeof window === 'undefined') return;
    const tg = (window as any)?.Telegram?.WebApp?.HapticFeedback;
    if ((tg as any)?.notificationOccurred) { (tg as any).notificationOccurred('success'); return; }
    if ((tg as any)?.impactOccurred) { (tg as any).impactOccurred('medium'); return; }
    if ('vibrate' in navigator) (navigator as any).vibrate([10, 30, 10]);
  } catch {}
}

export function hapticError() {
  try {
    if (typeof window === 'undefined') return;
    const tg = (window as any)?.Telegram?.WebApp?.HapticFeedback;
    if ((tg as any)?.notificationOccurred) { (tg as any).notificationOccurred('error'); return; }
    if ((tg as any)?.impactOccurred) { (tg as any).impactOccurred('heavy'); return; }
    if ('vibrate' in navigator) (navigator as any).vibrate([40]);
  } catch {}
}

// Усиленный «двойной» хаптик для стриков 5/10 подряд
export function hapticStreakMilestone() {
  try {
    if (typeof window === 'undefined') return;
    const tg = (window as any)?.Telegram?.WebApp?.HapticFeedback;
    if (tg?.impactOccurred) {
      tg.impactOccurred('heavy');
      setTimeout(() => { try { tg.impactOccurred('heavy'); } catch {} }, 140);
      return;
    }
    if (tg?.selectionChanged) {
      tg.selectionChanged();
      setTimeout(() => { try { tg.selectionChanged(); } catch {} }, 140);
      return;
    }
    if ('vibrate' in navigator) (navigator as any).vibrate([0, 70, 60, 70]);
  } catch {}
}