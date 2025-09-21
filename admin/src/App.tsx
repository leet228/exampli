import './App.css'
import { useEffect, useRef, useState } from 'react'
import Camera from './components/Camera'
// PoseGuide больше не используем — регистрация по таймеру
import { ensureEmbeddingSession, l2normalize, cosine, cropFaceToCanvas, imageDataToOrtTensor } from './lib/embeddings'

function App() {
  const [mode, setMode] = useState<'idle'|'enroll'|'login'|'ok'>('idle')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const sessionRef = useRef<any>(null)
  const templateRef = useRef<Float32Array | null>(null)
  const [log, setLog] = useState<string>('')
  const landmarksRef = useRef<{ x: number; y: number }[] | null>(null)
  const [livenessPrompt, setLivenessPrompt] = useState<string>('')
  const [samplesCount, setSamplesCount] = useState<number>(0)
  const [secondsLeft, setSecondsLeft] = useState<number>(0)
  // yaw0/pitch0 калибровка больше не используется
  const yawEmaRef = useRef<number>(0)
  const pitchEmaRef = useRef<number>(0)
  // калибровочные буферы удалены
  const [phaseMsg, setPhaseMsg] = useState<string>('')
  // guideDir более не используется в таймерной регистрации

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

  async function handleEnroll() {
    setMode('enroll')
    setPhaseMsg('Запись 20с: просто двигай головой')
    setSamplesCount(0)
    const got: Float32Array[] = []
    const start = Date.now()
    const totalMs = 20000
    const yawPitchFromPts = (pts: { x: number; y: number }[]) => {
      // Используем ключевые точки: 33 (левый глаз внешний), 263 (правый глаз внешний), 1 (нос), 13 (верхняя губа)
      const p33 = pts[33], p263 = pts[263], p1 = pts[1], p13 = pts[13]
      if (p33 && p263 && p1 && p13) {
        const midEyeX = (p33.x + p263.x) / 2
        const midEyeY = (p33.y + p263.y) / 2
        const interEye = Math.hypot(p263.x - p33.x, p263.y - p33.y) || 1
        // yaw: смещение носа по X относительно центра глаз, нормированное на межглазье
        let yaw = (p1.x - midEyeX) / (interEye * 0.35)
        // pitch: относительная высота носа между глазами и ртом
        let pitch = ((midEyeY - p1.y) - (p13.y - midEyeY)) / (interEye * 0.5)
        // ограничим мягче, чтобы не "липло"
        yaw = Math.max(-0.8, Math.min(0.8, yaw))
        pitch = Math.max(-0.8, Math.min(0.8, pitch))
        return { yaw, pitch }
      }
      // запасной вариант — по bbox
      let minX = 1, minY = 1, maxX = 0, maxY = 0
      for (const p of pts) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y }
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      const yaw = Math.max(-0.8, Math.min(0.8, (cx - 0.5) * 2))
      const pitch = Math.max(-0.8, Math.min(0.8, (0.5 - cy) * 2))
      return { yaw, pitch }
    }
    let lastFaceTs = 0
    while (Date.now() - start < totalMs) {
      const pts = landmarksRef.current
      if (pts && pts.length) {
        lastFaceTs = Date.now()
        const raw = yawPitchFromPts(pts)
        // сглаживание EMA (не для калибровки, просто стабилизируем)
        yawEmaRef.current = yawEmaRef.current * 0.8 + raw.yaw * 0.2
        pitchEmaRef.current = pitchEmaRef.current * 0.8 + raw.pitch * 0.2
        // любой кадр, пока лицо в кадре — учитываем
        const emb = await captureEmbeddingOnce()
        if (emb) { got.push(emb); setSamplesCount(got.length) }
      } else {
        if (Date.now() - lastFaceTs > 800) setPhaseMsg('Не вижу лицо — встань в кадр')
      }
      const left = Math.max(0, totalMs - (Date.now() - start))
      setSecondsLeft(Math.ceil(left / 1000))
      await new Promise(r => setTimeout(r, 33)) // ~30fps
    }
    const all: Float32Array[] = got
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
        <Camera onReady={(v) => { videoRef.current = v }} onLandmarks={(pts) => { landmarksRef.current = pts }} />
        {mode === 'enroll' && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ height: 24 }} />
            <div style={{ textAlign: 'center', color: '#ffd166', fontWeight: 800 }}>
              <div style={{ fontSize: 48, lineHeight: 1 }}>{secondsLeft || 0}</div>
              <div style={{ marginTop: 6 }}>идёт запись…</div>
            </div>
            <div style={{ width: '90%', marginBottom: 14 }}>
              <div style={{ height: 10, background: 'rgba(255,255,255,0.2)', borderRadius: 9999, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, Math.round(((20 - (secondsLeft||0)) / 20) * 100))}%`, height: '100%', background: '#57cc02' }} />
              </div>
              <div style={{ marginTop: 6, textAlign: 'right', fontWeight: 700, color: '#57cc02' }}>{samplesCount} кадров</div>
            </div>
          </div>
        )}
      </div>
      {phaseMsg && (
        <div style={{ marginTop: 8, fontWeight: 700 }}>{phaseMsg}</div>
      )}
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
