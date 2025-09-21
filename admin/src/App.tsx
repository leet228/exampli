import './App.css'
import { useEffect, useRef, useState } from 'react'
import Camera from './components/Camera'
// PoseGuide больше не используем — регистрация по таймеру
import { ensureEmbeddingSession, l2normalize, cosine, cropFaceToCanvas, imageDataToOrtTensor } from './lib/embeddings'

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const sessionRef = useRef<any>(null)
  const templateRef = useRef<Float32Array | null>(null)
  const landmarksRef = useRef<{ x: number; y: number }[] | null>(null)
  // статуса сейчас не отображаем
  // калибровочные буферы удалены
  // guideDir более не используется в таймерной регистрации

  useEffect(() => {
    // Гарантируем одну общую сессию (кэшируется)
    (async () => {
      try {
        const modelUrl = import.meta.env.BASE_URL + 'models/w600k_r50.onnx'
        const sess = await ensureEmbeddingSession(modelUrl)
        sessionRef.current = sess
        setSessionReady(true)
        // Попробуем восстановить локальный эталон (необязательно)
        try {
          const saved = localStorage.getItem('admin:face_template')
          if (saved) templateRef.current = new Float32Array(JSON.parse(saved) as number[])
        } catch {}
      } catch (e) {
        // ignore
      }
    })()
  }, [])

  async function captureEmbeddingOnce(): Promise<Float32Array | null> {
    const sess = sessionRef.current
    const v = videoRef.current
    if (!sess || !v) return null
    // Быстрый путь: реже создаём canvas; используем прямой ImageData
    const faceCanvas = cropFaceToCanvas(v, landmarksRef.current, 112)
    const ctx = faceCanvas.getContext('2d')!
    const img = ctx.getImageData(0, 0, faceCanvas.width, faceCanvas.height)
    const input = imageDataToOrtTensor(sess.ort, img)
    const inputName = Array.isArray(sess.session.inputNames) && sess.session.inputNames.length
      ? sess.session.inputNames[0]
      : 'input.1'
    const outputName = Array.isArray(sess.session.outputNames) && sess.session.outputNames.length
      ? sess.session.outputNames[0]
      : undefined
    const feeds: Record<string, any> = { [inputName]: input }
    const output = await sess.session.run(feeds)
    const key = outputName ?? Object.keys(output)[0]
    const vect = output[key].data as Float32Array
    return l2normalize(vect)
  }

  async function handleAuth() {
    try {
      const r = await fetch('/api/face_template')
      if (!r.ok) throw new Error('no_template')
      const json = await r.json()
      const master: number[] = json?.template || []
      if (!master.length) throw new Error('empty')
      const tmpl = l2normalize(new Float32Array(master))
      // Запускаем короткую сессию сбора и сравниваем
      const start = Date.now()
      const ms = 2000
      const parts: Float32Array[] = []
      while (Date.now() - start < ms) {
        const emb = await captureEmbeddingOnce()
        if (emb) parts.push(emb)
        await new Promise(r => setTimeout(r, 50))
      }
      if (!parts.length) throw new Error('no_face')
      const acc = new Float32Array(parts[0].length)
      for (const p of parts) for (let i = 0; i < acc.length; i++) acc[i] += p[i]
      for (let i = 0; i < acc.length; i++) acc[i] /= parts.length
      const probe = l2normalize(acc)
      const score = cosine(tmpl, probe)
      const el = document.querySelector('.auth-ring') as HTMLElement | null
      if (el) {
        // Включаем бегущую рамку на время проверки
        el.style.setProperty('--ring-duration', `${Math.max(0.6, ms / 1000)}s`)
        if (score >= 0.40) { el.classList.remove('auth-ring--fail'); el.classList.add('auth-ring--ok') }
        else { el.classList.remove('auth-ring--ok'); el.classList.add('auth-ring--fail') }
        setTimeout(() => { el.classList.remove('auth-ring--ok'); el.classList.remove('auth-ring--fail') }, 800)
      }
    } catch {
      // ignore
    }
  }

  // login больше не нужен — авто-проверка при загрузке

  useEffect(() => { if (sessionReady) handleAuth() }, [sessionReady])

  return (
    <div style={{ height: '100vh', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: 'min(900px, 95vw)' }}>
        <Camera onReady={(v) => { videoRef.current = v }} onLandmarks={(pts) => { landmarksRef.current = pts }} />
        {/* Зеленая жирная бегущая рамка */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 12 }}>
          <div className="auth-ring" />
        </div>
      </div>
      {/* Результат без слов, только цвет рамки меняем через класс */}
    </div>
  )
}

export default App
