import { useEffect, useRef, useState } from 'react'
import { loadFaceLandmarker } from '../lib/mediapipe'

async function getCameraPermissionState(): Promise<'granted'|'denied'|'prompt'|null> {
	try {
		// @ts-ignore — Permissions API может отсутствовать в некоторых WebView
		const st = await navigator.permissions.query({ name: 'camera' as PermissionName })
		return (st?.state as any) ?? null
	} catch {
		return null
	}
}

type CameraProps = {
  facingMode?: 'user' | 'environment'
  onError?: (err: unknown) => void
  onReady?: (video: HTMLVideoElement) => void
  onLandmarks?: (pts: { x: number; y: number }[] | null) => void
}

export default function Camera({ facingMode = 'user', onError, onReady, onLandmarks }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const [needsUserGesture, setNeedsUserGesture] = useState(false)

  const openCamera = async () => {
	try {
		setError(null)
		setReady(false)
		const stream = await navigator.mediaDevices.getUserMedia({
			video: { facingMode },
			audio: false,
		})
		streamRef.current = stream
		const v = videoRef.current
		if (v) {
			v.srcObject = stream
			await v.play().catch(() => {})
			setReady(true)
			setNeedsUserGesture(false)
			try { onReady?.(v) } catch {}
		}
	} catch (e) {
		const msg = (e as any)?.message || 'Не удалось открыть камеру'
		setError(String(msg))
		onError?.(e)
	}
  }

  useEffect(() => {
    let alive = true
    const init = async () => {
      const perm = await getCameraPermissionState()
      if (perm === 'granted' || perm === null) {
        if (!alive) return
        await openCamera()
      } else {
        if (!alive) return
        setNeedsUserGesture(true)
      }
    }
    init()
    return () => {
      alive = false
      try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [facingMode, onError])

  // Детекция лица (когда видео готово)
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    let landmarker: any
    ;(async () => {
      try {
        const { landmarker: lm } = await loadFaceLandmarker()
        landmarker = lm
        let last = 0
        const loop = () => {
          if (cancelled) return
          const v = videoRef.current
          const c = canvasRef.current
          const now = performance.now()
          // ограничение FPS ~45 для более плотной записи
          if (now - last < 22) { rafRef.current = requestAnimationFrame(loop); return }
          last = now
          if (v && c) {
            const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1))
            c.width = Math.floor(v.videoWidth * dpr)
            c.height = Math.floor(v.videoHeight * dpr)
            const ctx = c.getContext('2d')!
            ctx.clearRect(0, 0, c.width, c.height)
            const res = landmarker.detectForVideo(v, now)
            if (res?.faceLandmarks?.length) {
              const pts = res.faceLandmarks[0] as { x: number; y: number }[]
              // Рисуем точки/бокс вручную, конвертируя нормализованные координаты в пиксели
              let minX = 1, minY = 1, maxX = 0, maxY = 0
              ctx.fillStyle = 'rgba(252,134,208,0.95)'
              for (const p of pts) {
                if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
                const x = p.x * c.width
                const y = p.y * c.height
                ctx.beginPath()
                ctx.arc(x, y, 2.2, 0, Math.PI * 2)
                ctx.fill()
              }
              try { onLandmarks?.(pts) } catch {}
            } else {
              try { onLandmarks?.(null) } catch {}
            }
          }
          rafRef.current = requestAnimationFrame(loop)
        }
        loop()
      } catch (e) {
        // тихо падаем — камера всё равно работает
      }
    })()
    return () => { cancelled = true; if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [ready])

  return (
    <div style={{ position: 'relative' }}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{ width: '100%', borderRadius: 12, transform: 'scaleX(-1)', background: '#000' }}
      />
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, transform: 'scaleX(-1)', pointerEvents: 'none', width: '100%', height: '100%' }} />
      {needsUserGesture && !ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={openCamera} style={{
            background: '#ffffff', color: '#000', borderRadius: 9999, border: 'none',
            padding: '12px 18px', fontSize: 16, cursor: 'pointer'
          }}>Включить камеру</button>
        </div>
      )}
      {!ready && !error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
          Разреши доступ к камере…
        </div>
      )}
      {error && (
        <div style={{ marginTop: 8, color: '#e55' }}>{error}</div>
      )}
    </div>
  )
}


