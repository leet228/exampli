// Lightweight client-side achievement PNG renderer and cache
// Used to precompute shareable images during boot step 2

type RenderCtx = {
  width: number;
  height: number;
  dpr: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

function createCtx(width: number, height: number): RenderCtx {
  const dpr = Math.min(2, (window.devicePixelRatio || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return { width, height, dpr, canvas, ctx };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  const rr = Math.min(r, h/2, w/2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function breakLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width <= maxWidth) cur = test; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function formatDate(d: Date) {
  const dd = `${d.getDate()}`.padStart(2, '0');
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function pluralDays(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if ([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) return 'дня';
  return 'дней';
}

function pluralLessons(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'урок';
  if ([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) return 'урока';
  return 'уроков';
}

export type UserForAch = {
  first_name?: string | null;
  max_streak?: number | null;
  streak?: number | null;
  perfect_lessons?: number | null;
  duel_wins?: number | null;
};

async function renderStreak(user: UserForAch, botUsername: string): Promise<Blob> {
  const n = Math.max(0, Number(user?.max_streak ?? user?.streak ?? 0));
  const { canvas, ctx, width, height } = createCtx(1080, 1520);
  ctx.fillStyle = '#3a1f1b'; ctx.fillRect(0, 0, width, height);
  const badgeSize = 680; const badgeX = (width - badgeSize) / 2; const badgeY = 150;
  const img = await loadImage('/profile/streak_ach.svg');
  ctx.drawImage(img, badgeX, badgeY, badgeSize, badgeSize);
  const digits = String(n).length; const fontSize = digits >= 3 ? 220 : (digits === 2 ? 240 : 270);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const numX = width / 2; const numY = badgeY + badgeSize + 64;
  ctx.lineWidth = 24; ctx.strokeStyle = '#612300'; ctx.miterLimit = 2; ctx.strokeText(String(n), numX, numY);
  ctx.fillStyle = '#9d4106'; ctx.fillText(String(n), numX, numY);
  const dateStr = formatDate(new Date());
  ctx.font = `600 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const dateW = ctx.measureText(dateStr).width; const pillW = dateW + 56; const pillH = 38 + 28;
  const pillX = (width - pillW) / 2; const pillY = badgeY + badgeSize + 140;
  roundRect(ctx, pillX, pillY, pillW, pillH, 18, 'rgba(255,255,255,0.08)');
  ctx.fillStyle = '#ffd08a'; ctx.fillText(dateStr, width / 2, pillY + pillH - 14 - 6);
  const name = (user?.first_name ? String(user.first_name).trim() : '');
  const title = `${name || 'Ты'} достиг стрика на ${n} ${pluralDays(n)}!`;
  ctx.font = `800 64px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle = '#ffb74d';
  const lines = breakLine(ctx, title, width - 160);
  let ty = (pillY + pillH + 140);
  for (const line of lines) { ctx.fillText(line, width / 2, ty); ty += 76; }
  if (botUsername) { ctx.font = `700 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`; ctx.fillStyle = '#ffd08a'; ctx.fillText(String(botUsername), width / 2, height - 40); }
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/png'));
}

async function renderPerfect(user: UserForAch, botUsername: string): Promise<Blob> {
  const n = Math.max(0, Number(user?.perfect_lessons ?? 0));
  const { canvas, ctx, width, height } = createCtx(1080, 1520);
  ctx.fillStyle = '#0d2c0f'; ctx.fillRect(0, 0, width, height);
  const badgeSize = 680; const badgeX = (width - badgeSize) / 2; const badgeY = 150;
  const img = await loadImage('/profile/perfect_ach.svg');
  ctx.drawImage(img, badgeX, badgeY, badgeSize, badgeSize);
  const digits = String(n).length; const fontSize = digits >= 3 ? 220 : (digits === 2 ? 240 : 270);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const numX = width / 2; const numY = badgeY + badgeSize + 64;
  ctx.lineWidth = 24; ctx.strokeStyle = '#066629'; ctx.strokeText(String(n), numX, numY);
  ctx.fillStyle = '#1fb75b'; ctx.fillText(String(n), numX, numY);
  const dateStr = formatDate(new Date());
  ctx.font = `600 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const dateW = ctx.measureText(dateStr).width; const pillW = dateW + 56; const pillH = 38 + 28;
  const pillX = (width - pillW) / 2; const pillY = badgeY + badgeSize + 140;
  roundRect(ctx, pillX, pillY, pillW, pillH, 18, 'rgba(255,255,255,0.08)');
  ctx.fillStyle = '#b3f5c7'; ctx.fillText(dateStr, width / 2, pillY + pillH - 14 - 6);
  const name = (user?.first_name ? String(user.first_name).trim() : '');
  const title = `${name || 'Ты'} прошёл без ошибок ${n} ${pluralLessons(n)}!`;
  ctx.font = `800 64px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle = '#6cf087';
  const lines = breakLine(ctx, title, width - 160);
  let ty = (pillY + pillH + 140);
  for (const line of lines) { ctx.fillText(line, width / 2, ty); ty += 76; }
  if (botUsername) { ctx.font = `700 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`; ctx.fillStyle = '#b3f5c7'; ctx.fillText(String(botUsername), width / 2, height - 40); }
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/png'));
}

async function renderDuel(user: UserForAch, botUsername: string): Promise<Blob> {
  const n = Math.max(0, Number(user?.duel_wins ?? 0));
  const { canvas, ctx, width, height } = createCtx(1080, 1520);
  ctx.fillStyle = '#2e1f00'; ctx.fillRect(0, 0, width, height);
  const badgeSize = 680; const badgeX = (width - badgeSize) / 2; const badgeY = 150;
  const img = await loadImage('/profile/duel_ach.svg');
  ctx.drawImage(img, badgeX, badgeY, badgeSize, badgeSize);
  const digits = String(n).length; const fontSize = digits >= 3 ? 220 : (digits === 2 ? 240 : 270);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const numX = width / 2; const numY = badgeY + badgeSize + 64;
  ctx.lineWidth = 24; ctx.strokeStyle = '#ff9803'; ctx.strokeText(String(n), numX, numY);
  ctx.fillStyle = '#b35102'; ctx.fillText(String(n), numX, numY);
  const dateStr = formatDate(new Date());
  ctx.font = `600 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const dateW = ctx.measureText(dateStr).width; const pillW = dateW + 56; const pillH = 38 + 28;
  const pillX = (width - pillW) / 2; const pillY = badgeY + badgeSize + 140;
  roundRect(ctx, pillX, pillY, pillW, pillH, 18, 'rgba(255,255,255,0.08)');
  ctx.fillStyle = '#ffd08a'; ctx.fillText(dateStr, width / 2, pillY + pillH - 14 - 6);
  const name = (user?.first_name ? String(user.first_name).trim() : '');
  const title = `${name || 'Ты'} одержал победу ${n} раз в дуэли`;
  ctx.font = `800 64px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle = '#ffc159';
  const lines = breakLine(ctx, title, width - 160);
  let ty = (pillY + pillH + 140);
  for (const line of lines) { ctx.fillText(line, width / 2, ty); ty += 76; }
  if (botUsername) { ctx.font = `700 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`; ctx.fillStyle = '#ffd08a'; ctx.fillText(String(botUsername), width / 2, height - 40); }
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/png'));
}

function setGlobal(name: 'streak' | 'perfect' | 'duel', value: number, blob: Blob) {
  try {
    const g: any = (window as any);
    g.__exampliAch = g.__exampliAch || {};
    g.__exampliAch[name] = { value, blob };
  } catch {}
}

export function getPrecomputedAchievement(name: 'streak' | 'perfect' | 'duel'): { value: number; blob: Blob } | null {
  try { return ((window as any).__exampliAch?.[name] as any) || null; } catch { return null; }
}

export async function precomputeAchievementPNGs(user: UserForAch, botUsername: string | null | undefined): Promise<void> {
  try {
    const nameTag = (() => {
      if (!botUsername) return '';
      const s = String(botUsername).trim();
      return s ? (s.startsWith('@') ? s : ('@' + s)) : '';
    })();
    const streakN = Math.max(0, Number(user?.max_streak ?? user?.streak ?? 0));
    const perfectN = Math.max(0, Number(user?.perfect_lessons ?? 0));
    const duelN = Math.max(0, Number(user?.duel_wins ?? 0));
    const [b1, b2, b3] = await Promise.all([
      renderStreak(user, nameTag),
      renderPerfect(user, nameTag),
      renderDuel(user, nameTag),
    ]);
    setGlobal('streak', streakN, b1);
    setGlobal('perfect', perfectN, b2);
    setGlobal('duel', duelN, b3);
  } catch {}
}


