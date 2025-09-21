export type WebVitalsSnapshot = {
  lcpMs: number | null
  fcpMs: number | null
  cls: number | null
  ttfbMs: number | null
}

export type ServerStatsSnapshot = {
  rps1m: number // requests per second averaged over last 60s
  p95ms5m: number | null // latency p95 over last 5m
  errorRate5m: number // 0..1 over last 5m
  totalInWindow: number // number of requests considered
}

export type LocalMetrics = {
  vitals: WebVitalsSnapshot
  server: ServerStatsSnapshot
}

type RequestSample = { t: number; ms: number; ok: boolean }

const subscribers: Array<(m: LocalMetrics) => void> = []
let reqSamples: RequestSample[] = []
let snapshot: LocalMetrics = {
  vitals: { lcpMs: null, fcpMs: null, cls: null, ttfbMs: null },
  server: { rps1m: 0, p95ms5m: null, errorRate5m: 0, totalInWindow: 0 },
}

function emit() {
  const copy: LocalMetrics = JSON.parse(JSON.stringify(snapshot))
  for (const fn of subscribers) {
    try { fn(copy) } catch {}
  }
}

function computeServerStats(): void {
  const now = Date.now()
  const cutoff5m = now - 5 * 60_000
  const cutoff1m = now - 60_000
  // drop old
  reqSamples = reqSamples.filter(s => s.t >= cutoff5m)
  const last1m = reqSamples.filter(s => s.t >= cutoff1m)
  const rps1m = last1m.length / 60
  if (reqSamples.length === 0) {
    snapshot.server = { rps1m, p95ms5m: null, errorRate5m: 0, totalInWindow: 0 }
    return
  }
  const errors = reqSamples.filter(s => !s.ok).length
  const errorRate5m = errors / reqSamples.length
  const sorted = [...reqSamples].sort((a, b) => a.ms - b.ms)
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95) - 1))
  const p95ms5m = sorted[idx]?.ms ?? null
  snapshot.server = { rps1m, p95ms5m, errorRate5m, totalInWindow: reqSamples.length }
}

function instrumentFetch(): void {
  try {
    const orig = window.fetch
    if ((window as any).__adminFetchInstrumented) return
    ;(window as any).__adminFetchInstrumented = true
    window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const start = performance.now()
      let ok = false
      try {
        const res = await orig(input as any, init as any)
        ok = res.ok
        return res
      } catch (e) {
        ok = false
        throw e
      } finally {
        const ms = performance.now() - start
        reqSamples.push({ t: Date.now(), ms, ok })
        computeServerStats()
        emit()
      }
    } as typeof window.fetch
  } catch {}
}

function instrumentWebVitals(): void {
  try {
    // TTFB
    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (nav) snapshot.vitals.ttfbMs = nav.responseStart
    } catch {}

    // FCP
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if ((e as any).name === 'first-contentful-paint') {
            snapshot.vitals.fcpMs = e.startTime
            emit()
          }
        }
      })
      po.observe({ type: 'paint', buffered: true } as any)
    } catch {}

    // LCP
    try {
      const po = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const last = entries[entries.length - 1]
        if (last) {
          snapshot.vitals.lcpMs = last.startTime
          emit()
        }
      })
      po.observe({ type: 'largest-contentful-paint', buffered: true } as any)
    } catch {}

    // CLS
    try {
      let cls = 0
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries() as any) {
          if (!e.hadRecentInput) cls += e.value || 0
        }
        snapshot.vitals.cls = Number(cls.toFixed(4))
        emit()
      })
      po.observe({ type: 'layout-shift', buffered: true } as any)
    } catch {}
  } catch {}
}

export function startLocalMetrics(): void {
  instrumentFetch()
  instrumentWebVitals()
  computeServerStats()
  emit()
}

export function subscribeLocalMetrics(cb: (m: LocalMetrics) => void): () => void {
  subscribers.push(cb)
  cb(snapshot)
  return () => {
    const i = subscribers.indexOf(cb)
    if (i >= 0) subscribers.splice(i, 1)
  }
}


