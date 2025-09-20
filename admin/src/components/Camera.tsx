import { useEffect, useRef, useState } from 'react'
import { loadFaceLandmarker } from '../lib/mediapipe'

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

  useEffect(() => {
    let alive = true
    const start = async () => {
      try {
        setError(null)
        setReady(false)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false,
        })
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          await v.play().catch(() => {})
          setReady(true)
          try { onReady?.(v) } catch {}
        }
      } catch (e) {
        const msg = (e as any)?.message || 'Не удалось открыть камеру'
        setError(String(msg))
        onError?.(e)
      }
    }
    start()
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
    let drawUtils: any
    ;(async () => {
      try {
        const { landmarker: lm, DrawingUtils } = await loadFaceLandmarker()
        landmarker = lm
        drawUtils = DrawingUtils
        const loop = () => {
          if (cancelled) return
          const v = videoRef.current
          const c = canvasRef.current
          if (v && c) {
            c.width = v.videoWidth
            c.height = v.videoHeight
            const ctx = c.getContext('2d')!
            ctx.clearRect(0, 0, c.width, c.height)
            const res = landmarker.detectForVideo(v, performance.now())
            if (res?.faceLandmarks?.length) {
              const du = new drawUtils(c.getContext('2d'))
              res.faceLandmarks.forEach((lmks: any) => {
                du.drawConnectors(lmks, [[33,263],[362,133],[133,362]], { color: '#3c73ff', lineWidth: 2 })
                du.drawLandmarks(lmks, { color: '#fc86d0', lineWidth: 1, radius: 1 })
              })
              try { onLandmarks?.(res.faceLandmarks[0]) } catch {}
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
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, transform: 'scaleX(-1)', pointerEvents: 'none' }} />
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


