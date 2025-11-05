export function setupPreconnects(): void {
  try {
    const supa = (import.meta as any)?.env?.VITE_SUPABASE_URL as string | undefined;
    const add = (href: string) => {
      if (!href) return;
      const origin = new URL(href).origin;
      if (document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;
      const l = document.createElement('link');
      l.rel = 'preconnect';
      l.href = origin;
      l.crossOrigin = '';
      document.head.appendChild(l);
    };
    if (supa) add(supa);
    add('https://api.openai.com');
  } catch {}
}

export function setupLazyImagesObserver(): void {
  try {
    const mark = (img: HTMLImageElement) => {
      if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
    };
    document.querySelectorAll('img').forEach((n) => mark(n as HTMLImageElement));
    const mo = new MutationObserver((mut) => {
      for (const m of mut) {
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLImageElement) mark(n);
          if (n instanceof HTMLElement) n.querySelectorAll('img').forEach((i) => mark(i as HTMLImageElement));
        });
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch {}
}


