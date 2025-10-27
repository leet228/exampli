// Lightweight Web Worker to parse and preprocess /api/boot2 response

function toMoscowIso(date: Date): string {
  try {
    const fmt = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const parts = fmt.formatToParts(date);
    const y = Number(parts.find(p => p.type === 'year')?.value || NaN);
    const m = Number(parts.find(p => p.type === 'month')?.value || NaN);
    const d = Number(parts.find(p => p.type === 'day')?.value || NaN);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${y}-${pad(m)}-${pad(d)}`;
  } catch {
    const y = date.getUTCFullYear(); const m = date.getUTCMonth() + 1; const d = date.getUTCDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${y}-${pad(m)}-${pad(d)}`;
  }
}

self.onmessage = (e: MessageEvent<string>) => {
  try {
    const text = e.data;
    const raw = JSON.parse(text || '{}');
    const d = Array.isArray(raw) ? (raw[0] || {}) : (raw || {});
    const friends = Array.isArray(d.friends) ? d.friends : [];
    const invites = Array.isArray(d.invites) ? d.invites : [];
    const subjectsAll = Array.isArray(d.subjectsAll) ? d.subjectsAll : [];
    const topicsBySubject = d.topicsBySubject || {};
    const lessonsByTopic = d.lessonsByTopic || {};
    const lessonCountsByTopic = d.lessonCountsByTopic || {};
    const streakDaysAll = Array.isArray(d.streakDaysAll) ? d.streakDaysAll : [];

    // Compute lastStreakDay and yesterdayFrozen strictly by MSK
    let lastStreakDay: string | null = null;
    let yesterdayFrozen = false;
    try {
      const todayIso = toMoscowIso(new Date());
      const todayStart = new Date(`${todayIso}T00:00:00+03:00`).getTime();
      const yesterday = new Date(todayStart - 86400000);
      const yesterdayIso = toMoscowIso(yesterday);
      for (const r of (streakDaysAll as any[])) {
        const di = String((r as any)?.day || '');
        if (!di || di > todayIso) continue;
        if (!lastStreakDay || di > lastStreakDay) lastStreakDay = di;
      }
      const yRec = (streakDaysAll as any[]).find((r: any) => String(r?.day || '') === yesterdayIso);
      yesterdayFrozen = String(yRec?.kind || '') === 'freeze';
    } catch {}

    // @ts-ignore
    (self as any).postMessage({
      friends, invites, subjectsAll, topicsBySubject, lessonsByTopic, lessonCountsByTopic, streakDaysAll,
      meta: { lastStreakDay, yesterdayFrozen }
    });
  } catch (err) {
    // @ts-ignore
    (self as any).postMessage({ error: String((err as any)?.message || err) });
  }
};


