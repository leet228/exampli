export function applyTelegramTheme() {
  const tg = (window as any)?.Telegram?.WebApp;
  if (!tg) return;
  tg.ready?.();
  tg.expand?.();

  const p = tg.themeParams || {};
  const root = document.documentElement;
  if (p.bg_color) root.style.setProperty('--bg', `#${p.bg_color}`);
  if (p.text_color) root.style.setProperty('--text', `#${p.text_color}`);
  if (p.button_color) root.style.setProperty('--accent', `#${p.button_color}`);
  if (p.secondary_bg_color) root.style.setProperty('--card', `#${p.secondary_bg_color}`);
}