import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import AppRouter from './pages/App';
import { applyTelegramTheme } from './theme/telegram';
import { setupViewportMode } from './theme/telegram';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

applyTelegramTheme();
setupViewportMode();

// Глобально блокируем системный зум/лупу по двойному тапу и dblclick (iOS/Android WebView)
try {
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouch < 350) {
      e.preventDefault();
    }
    lastTouch = now;
  }, { passive: false, capture: true });
  document.addEventListener('dblclick', (e) => {
    e.preventDefault();
  }, { passive: false, capture: true });
} catch {}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);