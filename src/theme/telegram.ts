export function applyTelegramTheme() {
  const tg = (window as any)?.Telegram?.WebApp;
  if (!tg) return;
  tg.ready?.();
  tg.expand?.();

  const p = tg.themeParams || {};
  const root = document.documentElement;

  // Оставляем нашу тёмную тему как базу.
  // НЕ меняем --bg и --text, чтобы текст не был чёрным на тёмном фоне.
  // Из Telegram берём только акцент и вторичный фон (в тёмной схеме).
  if (p.button_color) root.style.setProperty('--accent', `#${p.button_color}`);
  if (p.secondary_bg_color && tg.colorScheme === 'dark') {
    root.style.setProperty('--card', `#${p.secondary_bg_color}`);
  }
}