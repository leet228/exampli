import './App.css'
import { useEffect, useRef, useState } from 'react'
import Camera from './components/Camera'
import PoseGuide from './components/PoseGuide'
import { ensureEmbeddingSession, l2normalize, cosine, cropFaceToCanvas, canvasToOrtTensor } from './lib/embeddings'

function App() {
  const [mode, setMode] = useState<'idle'|'enroll'|'login'|'ok'>('idle')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const sessionRef = useRef<any>(null)
  const templateRef = useRef<Float32Array | null>(null)
  const [log, setLog] = useState<string>('')
  const landmarksRef = useRef<{ x: number; y: number }[] | null>(null)
  const [livenessPrompt, setLivenessPrompt] = useState<string>('')
  const [coverage, setCoverage] = useState<number>(0)
  const [guideDir, setGuideDir] = useState<'left'|'right'|'up'|'down'|'center'>('center')
  const [faceBox, setFaceBox] = useState<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null)

  useEffect(() => {
    // Гарантируем одну общую сессию (кэшируется)
    (async () => {
      try {
        const modelUrl = import.meta.env.BASE_URL + 'models/w600k_r50.onnx'
        const sess = await ensureEmbeddingSession(modelUrl)
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

  async function handleEnroll() {
    setMode('enroll')
    // Сферическая сетка ракурсов (yaw/pitch) 10x10
    const GRID = 10
    const targetPerCell = 6
    const got: Array<Float32Array[]> = Array.from({ length: GRID * GRID }, () => [])
    const start = Date.now()
    const maxMs = 90000
    const yawPitchFromPts = (pts: { x: number; y: number }[]) => {
      let minX = 1, minY = 1, maxX = 0, maxY = 0
      for (const p of pts) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y }
      setFaceBox({ minX, minY, maxX, maxY })
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      const yaw = (cx - 0.5) * 2 // -1..1
      const pitch = (0.5 - cy) * 2 // -1..1
      return { yaw, pitch }
    }
    const cellIndex = (yaw: number, pitch: number) => {
      const yi = Math.max(0, Math.min(GRID - 1, Math.floor(((yaw + 1) / 2) * GRID)))
      const pi = Math.max(0, Math.min(GRID - 1, Math.floor(((pitch + 1) / 2) * GRID)))
      return pi * GRID + yi
    }
    const coveragePct = () => {
      const filled = got.reduce((acc, arr) => acc + (arr.length >= targetPerCell ? 1 : 0), 0)
      return Math.round((filled / (GRID * GRID)) * 100)
    }
    while (Date.now() - start < maxMs && coveragePct() < 100) {
      const pts = landmarksRef.current
      if (pts && pts.length) {
        const { yaw, pitch } = yawPitchFromPts(pts)
        // Подсказка направление
        const dYaw = Math.abs(yaw), dPitch = Math.abs(pitch)
        setGuideDir(dYaw > dPitch ? (yaw > 0 ? 'right' : 'left') : (pitch > 0 ? 'up' : 'down'))
        const idx = cellIndex(yaw, pitch)
        if (got[idx].length < targetPerCell) {
          const emb = await captureEmbeddingOnce()
          if (emb) got[idx].push(emb)
          setCoverage(coveragePct() / 100)
        }
      }
      await new Promise(r => setTimeout(r, 100))
    }
    const all: Float32Array[] = got.flat()
    if (all.length) {
      const acc = new Float32Array(all[0].length)
      for (const p of all) for (let i = 0; i < acc.length; i++) acc[i] += p[i]
      for (let i = 0; i < acc.length; i++) acc[i] /= all.length
      templateRef.current = l2normalize(acc)
      try { localStorage.setItem('admin:face_template', JSON.stringify(Array.from(templateRef.current))) } catch {}
      setLog('Эталон сохранён локально')
      setMode('idle')
      setLivenessPrompt('Регистрация пройдена')
      setTimeout(() => setLivenessPrompt(''), 1500)
    } else {
      setLog('Не удалось собрать эталон')
      setMode('idle')
    }
  }

  // Убрали liveness: логин пассивный

  async function handleLogin() {
    setMode('login')
    const tmpl = templateRef.current
    if (!tmpl) { setLog('Нет эталона — сначала пройди enrollment'); setMode('idle'); return }
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
    const THRESHOLD = 0.40
    if (score >= THRESHOLD) {
      setMode('ok')
    } else {
      setMode('idle')
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <h2>Admin — Face Enrollment/Login (прототип)</h2>
      <div style={{ margin: '12px 0' }}>
        <button onClick={handleEnroll} disabled={!sessionReady || mode !== 'idle'}>Enrollment</button>
        <button onClick={handleLogin} disabled={!sessionReady || mode !== 'idle'} style={{ marginLeft: 8 }}>Login</button>
      </div>
      <div style={{ position: 'relative' }}>
        <Camera onReady={(v) => { videoRef.current = v }} onLandmarks={(pts) => {
          landmarksRef.current = pts
          if (pts && pts.length) {
            let minX = 1, minY = 1, maxX = 0, maxY = 0
            for (const p of pts) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y }
            setFaceBox({ minX, minY, maxX, maxY })
          }
        }} />
        {mode === 'enroll' && (
          <PoseGuide direction={guideDir} progress={coverage} />
        )}
      </div>
      {livenessPrompt && (
        <div style={{ marginTop: 8, fontWeight: 700, color: '#3c73ff' }}>{livenessPrompt}</div>
      )}
      {mode === 'ok' && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'rgba(60,115,255,0.12)', color: '#3c73ff', fontWeight: 700 }}>
          Авторизация успешна
        </div>
      )}
      <div style={{ marginTop: 12, color: '#888' }}>{log}</div>
    </div>
  )
}

export default App
