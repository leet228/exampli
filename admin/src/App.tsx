import './App.css'
import { useEffect, useRef, useState } from 'react'
import Camera from './components/Camera'
// PoseGuide больше не используем — регистрация по таймеру
import { ensureEmbeddingSession, l2normalize, cosine, cropFaceToCanvas, imageDataToOrtTensor } from './lib/embeddings'

type PasscodeEntryProps = {
  length?: number
  value: string
  onChange: (next: string) => void
  onSubmit: () => void
  title?: string
}

function PasscodeEntry({ length = 12, value, onChange, onSubmit, title }: PasscodeEntryProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  function focusInput() {
    inputRef.current?.focus()
  }

  function sanitizeDigits(src: string) {
    return src.replace(/\D+/g, '').slice(0, length)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = sanitizeDigits(e.target.value)
    if (digits !== value) onChange(digits)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && value.length === length) {
      e.preventDefault()
      onSubmit()
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text') || ''
    const digits = sanitizeDigits(text)
    if (digits) {
      e.preventDefault()
      onChange(digits)
    }
  }

  const slots = Array.from({ length }, (_, i) => value[i] ?? '')

  return (
    <div className="passcode" onClick={focusInput}>
      {title ? <div className="passcode__title">{title}</div> : null}
      <div className="passcode__slots">
        {slots.map((digit, idx) => (
          <div key={idx} className={`passcode__slot${value.length === idx ? ' passcode__slot--active' : ''}`}>
            <div className="passcode__digit">{digit}</div>
            <div className="passcode__line" />
          </div>
        ))}
      </div>
      {/* Скрытый инпут — нужен только для ввода/клавиатуры */}
      <input
        ref={inputRef}
        className="passcode__hidden-input"
        inputMode="numeric"
        pattern="[0-9]*"
        type="tel"
        autoComplete="one-time-code"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        aria-label="Код доступа"
      />
    </div>
  )
}

function haptic(type: 'correct' | 'error') {
  try {
    if (navigator && 'vibrate' in navigator) {
      if (type === 'correct') {
        // короткий один импульс
        navigator.vibrate?.(40)
      } else {
        // двойной сбойной импульс
        navigator.vibrate?.([20, 30, 40])
      }
    }
    // iOS/Android PWA доп. каналы можно добавить здесь при необходимости
  } catch {}
}

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const sessionRef = useRef<any>(null)
  const templateRef = useRef<Float32Array | null>(null)
  const landmarksRef = useRef<{ x: number; y: number }[] | null>(null)
  const [mode, setMode] = useState<'camera' | 'code'>('camera')
  const [passcode, setPasscode] = useState('')
  const [passcodeError, setPasscodeError] = useState('')
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
      const threshold = 0.40
      const el = document.querySelector('.auth-ring') as HTMLElement | null
      if (el) {
        // Задаём длину штриха и периметр под текущий размер рамки
        const svg = el.querySelector('svg') as SVGSVGElement | null
        const rect = svg?.querySelector('rect.auth-ring-svg__path') as SVGRectElement | null
        if (rect && svg) {
          const bb = el.getBoundingClientRect()
          const r = 12
          const w = bb.width, h = bb.height
          const perim = 2 * (w + h - 4 * r) + 2 * Math.PI * r
          rect.style.setProperty('--perim', String(perim))
          rect.style.setProperty('--dash', String(Math.max(80, Math.round(perim / 10))))
        }
        // Включаем бегущую белую полоску на время проверки
        el.classList.add('running')
        el.style.setProperty('--ring-duration', `${Math.max(0.6, ms / 1000)}s`)
        // По результату — выключаем бег и показываем статичную зелёную/красную рамку
        setTimeout(() => {
          el.classList.remove('running')
          if (score >= threshold) { 
            el.classList.remove('auth-ring--fail'); 
            el.classList.add('auth-ring--ok');
            haptic('correct')
            setTimeout(() => { window.location.assign('/admin') }, 200)
          }
          else { 
            el.classList.remove('auth-ring--ok'); 
            el.classList.add('auth-ring--fail');
            haptic('error')
          }
          // Если не найден — переключаемся на ввод кода
          if (score < threshold) {
            setTimeout(() => setMode('code'), 200)
          }
          // Сбрасываем цвет через 1.2s, если нужно повторять проверки
          setTimeout(() => { el.classList.remove('auth-ring--ok'); el.classList.remove('auth-ring--fail') }, 1200)
        }, ms)
      }
    } catch {
      // Любая ошибка — показываем ввод кода
      haptic('error')
      setMode('code')
    }
  }

  // login больше не нужен — авто-проверка при загрузке

  useEffect(() => { if (sessionReady) handleAuth() }, [sessionReady])

  function handleSubmitPasscode() {
    (async () => {
      try {
        const r = await fetch('/api/verify_passcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: passcode })
        })
        const json = await r.json().catch(() => ({}))
        if (!r.ok || !json?.ok) {
          haptic('error')
          setPasscodeError('Неверный код')
          setPasscode('')
          return
        }
        haptic('correct')
        // Переходим на страницу админки
        window.location.assign('/admin')
      } catch {
        haptic('error')
        setPasscodeError('Ошибка сети')
      }
    })()
  }

  return (
    <div className={mode === 'code' ? 'screen screen--code' : 'screen screen--camera'}>
      {mode === 'camera' ? (
        <div className="camera-wrap">
          <div className="camera-aspect">
            <Camera onReady={(v) => { videoRef.current = v }} onLandmarks={(pts) => { landmarksRef.current = pts }} />
            {/* Зеленая жирная бегущая рамка — SVG вдоль краёв видео */}
            <div className="auth-ring">
              <svg className="auth-ring-svg" preserveAspectRatio="none">
                <rect x="0" y="0" width="100%" height="100%" rx="12" ry="12" fill="none" stroke="transparent" />
                <rect x="0" y="0" width="100%" height="100%" rx="12" ry="12" className="auth-ring-svg__path" />
              </svg>
            </div>
          </div>
        </div>
      ) : (
        <div className="code-wrap">
          <PasscodeEntry
            title="Введите код доступа"
            value={passcode}
            onChange={setPasscode}
            onSubmit={handleSubmitPasscode}
          />
          {passcodeError ? <div className="passcode__error">{passcodeError}</div> : null}
          <button
            className="btn btn--primary"
            disabled={passcode.length !== 12}
            onClick={handleSubmitPasscode}
          >
            Войти
          </button>
        </div>
      )}
    </div>
  )
}

export default App
