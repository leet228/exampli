// Обёртка над onnxruntime-web для эмбеддингов лица (ArcFace/InsightFace)
// Примерный интерфейс; файл модели должен быть доступен по URL

let ortPromise: Promise<typeof import('onnxruntime-web')> | null = null
function loadOrt() {
  if (!ortPromise) ortPromise = import('onnxruntime-web')
  return ortPromise
}

let sessionPromise: Promise<{ ort: any; session: any }> | null = null

async function fetchModelBuffer(modelUrl: string): Promise<Uint8Array> {
  try {
    const cache = await caches.open('admin-face-model-v1')
    let res = await cache.match(modelUrl)
    if (!res) {
      const net = await fetch(modelUrl, { cache: 'force-cache' })
      await cache.put(modelUrl, net.clone())
      res = net
    }
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  } catch {
    const net = await fetch(modelUrl)
    const buf = await net.arrayBuffer()
    return new Uint8Array(buf)
  }
}

export async function createEmbeddingSession(modelUrl: string) {
  const ort = await loadOrt()
  try { ort.env.wasm.wasmPaths = (import.meta as any).env.BASE_URL + 'ort/' } catch {}
  try { ort.env.wasm.numThreads = 1 } catch {}
  try { ort.env.wasm.simd = true } catch {}
  const modelData = await fetchModelBuffer(modelUrl)
  const session = await ort.InferenceSession.create(modelData, { executionProviders: ['wasm'] as any })
  return { ort, session }
}

export async function ensureEmbeddingSession(modelUrl: string) {
  if (!sessionPromise) sessionPromise = createEmbeddingSession(modelUrl)
  return sessionPromise
}

export function prefetchEmbeddingSession(modelUrl: string) {
  if (!sessionPromise) sessionPromise = createEmbeddingSession(modelUrl)
}

export function l2normalize(v: Float32Array) {
  let sum = 0
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i]
  const n = Math.sqrt(sum) || 1
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n
  return out
}

export function cosine(a: Float32Array, b: Float32Array) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { const av = a[i], bv = b[i]; dot += av * bv; na += av * av; nb += bv * bv }
  return dot / ((Math.sqrt(na) * Math.sqrt(nb)) || 1)
}

// Препроцессинг: кроп по лэндмаркам и ресайз в квадрат для модели
export function cropFaceToCanvas(
  video: HTMLVideoElement,
  landmarks: { x: number; y: number }[] | null,
  size = 112,
) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width = size
  canvas.height = size
  if (!landmarks || landmarks.length === 0) {
    // центрируем фрейм как fallback
    const s = Math.min(video.videoWidth, video.videoHeight)
    const sx = (video.videoWidth - s) / 2
    const sy = (video.videoHeight - s) / 2
    ctx.drawImage(video, sx, sy, s, s, 0, 0, size, size)
    return canvas
  }
  // вычислим bbox по точкам
  let minX = 1, minY = 1, maxX = 0, maxY = 0
  for (const p of landmarks) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y }
  // координаты приходят в относительных 0..1
  const pad = 0.4 // добавим поля, чтобы захватить голову/уши
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const w = (maxX - minX)
  const h = (maxY - minY)
  const half = Math.max(w, h) * (1 + pad) / 2
  const sx = Math.max(0, (cx - half) * video.videoWidth)
  const sy = Math.max(0, (cy - half) * video.videoHeight)
  const sw = Math.min(video.videoWidth - sx, half * 2 * video.videoWidth)
  const sh = Math.min(video.videoHeight - sy, half * 2 * video.videoHeight)
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, size, size)
  return canvas
}

// Подготовка тензора (NCHW 1x3x112x112 в float32 с нормализацией [-1,1])
export function canvasToOrtTensor(ort: any, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const { width, height } = canvas
  const img = ctx.getImageData(0, 0, width, height)
  const data = img.data
  const out = new Float32Array(3 * width * height)
  // HWC->CHW и нормализация
  let r = 0, g = width * height, b = 2 * width * height
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i += 4) {
      const R = data[i] / 255 * 2 - 1
      const G = data[i + 1] / 255 * 2 - 1
      const B = data[i + 2] / 255 * 2 - 1
      out[r++] = R
      out[g++] = G
      out[b++] = B
    }
  }
  const tensor = new ort.Tensor('float32', out, [1, 3, height, width])
  return tensor
}


