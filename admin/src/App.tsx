import './App.css'
import { useEffect, useRef, useState } from 'react'
import Camera from './components/Camera'
import { createEmbeddingSession, l2normalize, cosine, cropFaceToCanvas, canvasToOrtTensor } from './lib/embeddings'

function App() {
  const [mode, setMode] = useState<'idle'|'enroll'|'login'>('idle')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const sessionRef = useRef<any>(null)
  const templateRef = useRef<Float32Array | null>(null)
  const [log, setLog] = useState<string>('')
  const landmarksRef = useRef<{ x: number; y: number }[] | null>(null)
  const [livenessPrompt, setLivenessPrompt] = useState<string>('')

  useEffect(() => {
    // Загружаем onnx с CDN (примерная ссылка — заменишь на свою модель)
    (async () => {
      try {
        const modelUrl = import.meta.env.BASE_URL + 'models/w600k_r50.onnx'
        const sess = await createEmbeddingSession(modelUrl)
        sessionRef.current = sess
        setSessionReady(true)
        // Попробуем восстановить локальный эталон
        try {
          const saved = localStorage.getItem('admin:face_template')
          if (saved) {
            const arr = JSON.parse(saved) as number[]
            templateRef.current = new Float32Array(arr)
            setLog('Эталон загружен из localStorage')
          }
        } catch {}
      } catch (e) {
        setLog('Не удалось загрузить модель эмбеддингов')
      }
    })()
  }, [])

  async function captureEmbeddingOnce(): Promise<Float32Array | null> {
    const sess = sessionRef.current
    const v = videoRef.current
    if (!sess || !v) return null
    const faceCanvas = cropFaceToCanvas(v, landmarksRef.current, 112)
    const input = canvasToOrtTensor(sess.ort, faceCanvas)
    const output = await sess.session.run({ input })
    const key = Object.keys(output)[0]
    const vect = output[key].data as Float32Array
    return l2normalize(vect)
  }

  async function handleEnroll() {
    setMode('enroll')
    const parts: Float32Array[] = []
    for (let i = 0; i < 20; i++) {
      const emb = await captureEmbeddingOnce()
      if (emb) parts.push(emb)
      await new Promise(r => setTimeout(r, 120))
    }
    if (parts.length) {
      // усреднение
      const acc = new Float32Array(parts[0].length)
      for (const p of parts) for (let i = 0; i < acc.length; i++) acc[i] += p[i]
      for (let i = 0; i < acc.length; i++) acc[i] /= parts.length
      templateRef.current = l2normalize(acc)
      try { localStorage.setItem('admin:face_template', JSON.stringify(Array.from(templateRef.current))) } catch {}
      setLog('Эталон сохранён локально')
      setMode('idle')
    } else {
      setLog('Не удалось собрать эталон')
      setMode('idle')
    }
  }

  // Простейшая liveness: случайное движение головы — вправо/влево/вверх/вниз
  function runLiveness(timeoutMs = 4000, delta = 0.06): Promise<boolean> {
    const actions = [
      { key: 'right', text: 'Поверни голову вправо →', axis: 'x', sign: +1 },
      { key: 'left', text: 'Поверни голову влево ←', axis: 'x', sign: -1 },
      { key: 'up', text: 'Подними голову вверх ↑', axis: 'y', sign: -1 },
      { key: 'down', text: 'Опусти голову вниз ↓', axis: 'y', sign: +1 },
    ] as const
    const target = actions[Math.floor(Math.random() * actions.length)]
    setLivenessPrompt(target.text)
    const start = Date.now()
    const base = (() => {
      const pts = landmarksRef.current
      if (!pts || !pts.length) return { cx: 0.5, cy: 0.5 }
      let minX = 1, minY = 1, maxX = 0, maxY = 0
      for (const p of pts) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y }
      return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
    })()
    return new Promise<boolean>((resolve) => {
      const id = setInterval(() => {
        const pts = landmarksRef.current
        if (Date.now() - start > timeoutMs) { clearInterval(id); setLivenessPrompt(''); return resolve(false) }
        if (!pts || !pts.length) return
        let minX = 1, minY = 1, maxX = 0, maxY = 0
        for (const p of pts) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y }
        const cx = (minX + maxX) / 2
        const cy = (minY + maxY) / 2
        if (target.axis === 'x') {
          const d = cx - base.cx
          if (Math.sign(d) === target.sign && Math.abs(d) > delta) { clearInterval(id); setLivenessPrompt(''); resolve(true) }
        } else {
          const d = cy - base.cy
          if (Math.sign(d) === target.sign && Math.abs(d) > delta) { clearInterval(id); setLivenessPrompt(''); resolve(true) }
        }
      }, 80)
    })
  }

  async function handleLogin() {
    setMode('login')
    const tmpl = templateRef.current
    if (!tmpl) { setLog('Нет эталона — сначала пройди enrollment'); setMode('idle'); return }
    // liveness
    const ok = await runLiveness()
    if (!ok) { setLog('Liveness не пройден'); setMode('idle'); return }
    const parts: Float32Array[] = []
    for (let i = 0; i < 8; i++) {
      const emb = await captureEmbeddingOnce()
      if (emb) parts.push(emb)
      await new Promise(r => setTimeout(r, 120))
    }
    if (!parts.length) { setLog('Нет эмбеддингов'); setMode('idle'); return }
    // усредняем вход
    const acc = new Float32Array(parts[0].length)
    for (const p of parts) for (let i = 0; i < acc.length; i++) acc[i] += p[i]
    for (let i = 0; i < acc.length; i++) acc[i] /= parts.length
    const probe = l2normalize(acc)
    const score = cosine(tmpl, probe)
    setLog(`Сходство: ${score.toFixed(4)}`)
    setMode('idle')
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <h2>Admin — Face Enrollment/Login (прототип)</h2>
      <div style={{ margin: '12px 0' }}>
        <button onClick={handleEnroll} disabled={!sessionReady || mode !== 'idle'}>Enrollment</button>
        <button onClick={handleLogin} disabled={!sessionReady || mode !== 'idle'} style={{ marginLeft: 8 }}>Login</button>
      </div>
      <Camera onReady={(v) => { videoRef.current = v }} onLandmarks={(pts) => { landmarksRef.current = pts }} />
      {livenessPrompt && (
        <div style={{ marginTop: 8, fontWeight: 700, color: '#3c73ff' }}>{livenessPrompt}</div>
      )}
      <div style={{ marginTop: 12, color: '#888' }}>{log}</div>
    </div>
  )
}

export default App
