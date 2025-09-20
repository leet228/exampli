import './App.css'
import { useEffect, useRef, useState } from 'react'
import Camera from './components/Camera'
import EnrollmentGuide from './components/EnrollmentGuide'
import { createEmbeddingSession, l2normalize, cosine, cropFaceToCanvas, canvasToOrtTensor } from './lib/embeddings'

function App() {
  const [mode, setMode] = useState<'idle'|'enroll'|'login'|'ok'>('idle')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const sessionRef = useRef<any>(null)
  const templateRef = useRef<Float32Array | null>(null)
  const [log, setLog] = useState<string>('')
  const landmarksRef = useRef<{ x: number; y: number }[] | null>(null)
  const [livenessPrompt, setLivenessPrompt] = useState<string>('')
  const [enrollFilled, setEnrollFilled] = useState<boolean[]>([])
  const [enrollIndex, setEnrollIndex] = useState<number | null>(null)
  const [faceBox, setFaceBox] = useState<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null)

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
    // Круг из сегментов: 12 секторов окружности
    const segments = 48
    const targetPerSegment = 8
    const filled = new Array<boolean>(segments).fill(false)
    setEnrollFilled([...filled])
    setEnrollIndex(null)
    const perSegment: Array<Float32Array[]> = Array.from({ length: segments }, () => [])
    const counts: number[] = new Array<number>(segments).fill(0)
    const start = Date.now()
    // собираем до 60с или пока все сегменты не заполнены
    while (Date.now() - start < 60000 && filled.some(f => !f)) {
      // определим текущий азимут головы по центру bbox
      const pts = landmarksRef.current
      if (pts && pts.length) {
        let minX = 1, minY = 1, maxX = 0, maxY = 0
        for (const p of pts) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y }
        setFaceBox({ minX, minY, maxX, maxY })
        const cx = (minX + maxX) / 2
        const cy = (minY + maxY) / 2
        // преобразуем (cx,cy) в угол относительно центра кадра
        const dx = cx - 0.5
        const dy = 0.5 - cy
        const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)
        const idx = Math.floor((angle / (Math.PI * 2)) * segments) % segments
        setEnrollIndex(idx)
        // Снимаем кадры ПОКА голова в сегменте, до нужного количества
        if (!filled[idx]) {
          const emb = await captureEmbeddingOnce()
          if (emb) {
            perSegment[idx].push(emb)
            counts[idx]++
            if (counts[idx] >= targetPerSegment) {
              filled[idx] = true
              setEnrollFilled([...filled])
            }
          }
        }
      }
      await new Promise(r => setTimeout(r, 120))
    }
    // Считаем итоговый эталон по всем собранным кадрам
    const all: Float32Array[] = perSegment.flat()
    if (all.length) {
      const acc = new Float32Array(all[0].length)
      for (const p of all) for (let i = 0; i < acc.length; i++) acc[i] += p[i]
      for (let i = 0; i < acc.length; i++) acc[i] /= all.length
      templateRef.current = l2normalize(acc)
      try { localStorage.setItem('admin:face_template', JSON.stringify(Array.from(templateRef.current))) } catch {}
      setLog('Эталон сохранён локально')
      setMode('idle')
      setEnrollIndex(null)
      setLivenessPrompt('Регистрация пройдена')
      setTimeout(() => setLivenessPrompt(''), 1500)
    } else {
      setLog('Не удалось собрать эталон')
      setMode('idle')
      setEnrollIndex(null)
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
        <Camera onReady={(v) => { videoRef.current = v }} onLandmarks={(pts) => { landmarksRef.current = pts }} />
        {mode === 'enroll' && (
          <EnrollmentGuide
            width={videoRef.current?.videoWidth || 640}
            height={videoRef.current?.videoHeight || 480}
            segments={48}
            filled={enrollFilled.length ? enrollFilled : new Array(12).fill(false)}
            currentIndex={enrollIndex}
            faceBox={faceBox}
          />
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
