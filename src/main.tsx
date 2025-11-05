import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import AppRouter from './pages/App';
import { applyTelegramTheme } from './theme/telegram';
import { setupViewportMode } from './theme/telegram';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import { setupPreconnects, setupLazyImagesObserver } from './lib/preconnect';
import { registerSW } from 'virtual:pwa-register';

// Preconnect and lazy images
setupPreconnects();
setupLazyImagesObserver();

// PWA service worker
try { registerSW({ immediate: true }); } catch {}

applyTelegramTheme();
setupViewportMode();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);