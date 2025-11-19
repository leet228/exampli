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

// Preconnect and lazy images
setupPreconnects();
setupLazyImagesObserver();

applyTelegramTheme();
setupViewportMode();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);