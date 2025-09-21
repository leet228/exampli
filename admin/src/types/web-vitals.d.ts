declare module 'web-vitals' {
  export type Metric = {
    name: string
    value: number
    id: string
  }
  export function onCLS(cb: (m: Metric) => void): void
  export function onFID(cb: (m: Metric) => void): void
  export function onLCP(cb: (m: Metric) => void): void
  export function onINP(cb: (m: Metric) => void): void
  export function onFCP(cb: (m: Metric) => void): void
  export function onTTFB(cb: (m: Metric) => void): void
}


