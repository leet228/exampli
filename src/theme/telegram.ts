export function applyTelegramTheme(){
  const tg = (window as any)?.Telegram?.WebApp; if (!tg) return;
  tg.ready?.();
  tg.expand?.();
  try { tg.disableVerticalSwipes?.(); } catch {}
  const p = tg.themeParams || {}; const root = document.documentElement;
  if (p.button_color) root.style.setProperty('--accent', `#${p.button_color}`);
  if (p.secondary_bg_color && tg.colorScheme==='dark') root.style.setProperty('--card', `#${p.secondary_bg_color}`);
}
export function setupViewportMode() {
  const tg = (window as any)?.Telegram?.WebApp;
  if (!tg) return;

  tg.ready?.();

  // признак запуска ВНУТРИ чата (из меню/inline): Telegram передаёт объект chat
  const inChat = !!tg.initDataUnsafe?.chat; // для профиля бота обычно chat отсутствует. :contentReference[oaicite:3]{index=3}

  // Если НЕ из чата — хотим фуллскрин
  if (!inChat) {
    if (tg.isVersionAtLeast?.('8.0')) {
      // Bot API 8.0+: полноценный fullscreen
      if (!tg.isFullscreen) tg.requestFullscreen();
    } else {
      // Старые клиенты: максимум доступной высоты
      if (!tg.isExpanded) tg.expand();
    }
    // Если в твоём UX нужны отключённые свайпы — можно тут:
    // tg.disableVerticalSwipes?.();
  } else {
    // Запуск из чата — оставляем компакт
    // На всякий случай выходим из fullscreen, если вдруг попали туда
    if (tg.isVersionAtLeast?.('8.0') && tg.isFullscreen) tg.exitFullscreen();
    // Обычно в чате удобнее оставить свайпы включёнными
    tg.enableVerticalSwipes?.();
  }
}
