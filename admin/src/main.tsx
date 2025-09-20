import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { prefetchEmbeddingSession } from './lib/embeddings'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Префетчим модель эмбеддингов сразу при загрузке приложения
try { prefetchEmbeddingSession(import.meta.env.BASE_URL + 'models/w600k_r50.onnx') } catch {}
