import { onCLS, onFID, onLCP, onINP, onFCP, onTTFB } from 'web-vitals'
import type { Metric } from 'web-vitals'

function post(metric: Metric) {
  try {
    const payload = {
      name: metric.name,
      value: metric.value,
      id: metric.id,
      navigationType: (performance.getEntriesByType('navigation')[0] as any)?.type ?? null,
      url: location.href,
      ua: navigator.userAgent,
      ts: Date.now(),
    }
    navigator.sendBeacon?.('/api/rum', new Blob([JSON.stringify(payload)], { type: 'application/json' }))
  } catch {}
}

export function initRUM() {
  onCLS(post)
  onFID(post)
  onLCP(post)
  onINP(post)
  onFCP(post)
  onTTFB(post)
}


