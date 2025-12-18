import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import AppRouter from './pages/App';
import { applyTelegramTheme } from './theme/telegram';
import { setupViewportMode } from './theme/telegram';
// Удалены тяжелые CSS импорты - загружаются по требованию в MarkdownRenderer
// import 'katex/dist/katex.min.css';
// import 'highlight.js/styles/github-dark.css';
import { setupPreconnects, setupLazyImagesObserver } from './lib/preconnect';

function installSvgCacheBustOncePerDeploy(): void {
  try {
    const deploy = (typeof __DEPLOY_ID__ === 'string' && __DEPLOY_ID__) ? __DEPLOY_ID__ : '';
    if (!deploy) return;

    const patchUrl = (value: any): any => {
      try {
        if (typeof value !== 'string' || !value) return value;
        if (value.startsWith('data:') || value.startsWith('blob:')) return value;
        // Патчим только root-relative пути, чтобы не ломать внешние URL/относительные пути.
        if (!value.startsWith('/')) return value;

        const u = new URL(value, window.location.origin);
        if (!u.pathname.toLowerCase().endsWith('.svg')) return value;
        if (u.searchParams.has('v')) return value;
        u.searchParams.set('v', deploy);
        return `${u.pathname}${u.search}${u.hash}`;
      } catch {
        return value;
      }
    };

    const patchImgEl = (img: HTMLImageElement) => {
      try {
        const raw = img.getAttribute('src');
        if (!raw) return;
        const next = patchUrl(raw);
        if (typeof next === 'string' && next !== raw) img.setAttribute('src', next);
      } catch {}
    };

    const patchAllImgsUnder = (root: ParentNode) => {
      try {
        const imgs = root.querySelectorAll?.('img[src]') as NodeListOf<HTMLImageElement> | undefined;
        if (!imgs || !imgs.length) return;
        imgs.forEach(patchImgEl);
      } catch {}
    };

    // 1) Пропатчим уже существующие картинки (если что-то успело отрендериться)
    patchAllImgsUnder(document);

    // 2) И дальше патчим всё, что добавляется/меняется (React обычно ставит src через setAttribute)
    const obs = new MutationObserver((mutations) => {
      try {
        for (const m of mutations) {
          if (m.type === 'attributes') {
            if (m.attributeName === 'src' && m.target instanceof HTMLImageElement) patchImgEl(m.target);
            continue;
          }
          if (m.type === 'childList') {
            m.addedNodes.forEach((n) => {
              try {
                if (n instanceof HTMLImageElement) patchImgEl(n);
                if (n instanceof Element || n instanceof DocumentFragment) patchAllImgsUnder(n as ParentNode);
              } catch {}
            });
          }
        }
      } catch {}
    });
    obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  } catch {}
}

// Preconnect and lazy images
setupPreconnects();
setupLazyImagesObserver();
installSvgCacheBustOncePerDeploy();

applyTelegramTheme();
setupViewportMode();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);