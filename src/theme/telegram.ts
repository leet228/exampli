export function applyTelegramTheme() {
  const tg = (window as any)?.Telegram?.WebApp;
  if (!tg) return;
  tg.ready?.();
  tg.expand?.();
  // важное: отключаем закрытие свайпом вниз
  // (метод поддерживается в актуальных клиентах Telegram)
  try { tg.disableVerticalSwipes?.(); } catch {}

  const p = tg.themeParams || {};
  const root = document.documentElement;
  // нашу тёмную тему не трогаем: не меняем --bg и --text
  if (p.button_color) root.style.setProperty('--accent', `#${p.button_color}`);
  if (p.secondary_bg_color && tg.colorScheme === 'dark') {
    root.style.setProperty('--card', `#${p.secondary_bg_color}`);
  }
}