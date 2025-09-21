import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Admin from './Admin.tsx'
import Server from './Server.tsx'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { prefetchEmbeddingSession } from './lib/embeddings'

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/admin', element: <Admin /> },
  { path: '/admin/server', element: <Server /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

// Префетчим модель эмбеддингов сразу при загрузке приложения
try { prefetchEmbeddingSession(import.meta.env.BASE_URL + 'models/w600k_r50.onnx') } catch {}

// Отключаем дабл-клик зум и контекстное меню (лупа) на всём приложении
window.addEventListener('dblclick', (e) => { e.preventDefault() }, { passive: false })
window.addEventListener('gesturestart', (e: any) => { e.preventDefault() }, { passive: false })
window.addEventListener('gesturechange', (e: any) => { e.preventDefault() }, { passive: false })
window.addEventListener('gestureend', (e: any) => { e.preventDefault() }, { passive: false })
window.addEventListener('contextmenu', (e) => { e.preventDefault() })
