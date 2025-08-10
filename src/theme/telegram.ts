export function applyTelegramTheme() {
  const tg = (window as any)?.Telegram?.WebApp;
  if (!tg) return;
  tg.ready?.();
  tg.expand?.();
  try { tg.disableVerticalSwipes?.(); } catch {}
  const p = tg.themeParams || {};
  const root = document.documentElement;
  if (p.button_color) root.style.setProperty('--accent', `#${p.button_color}`);
  if (p.secondary_bg_color && tg.colorScheme === 'dark') {
    root.style.setProperty('--card', `#${p.secondary_bg_color}`);
  }
}