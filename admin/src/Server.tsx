import { useEffect, useState } from 'react'
import AdminNav from './components/AdminNav'
import { startLocalMetrics, subscribeLocalMetrics, type LocalMetrics } from './lib/localMetrics'

export default function Server() {
  return (
    <div className="admin-page">
      <div style={{ padding: 16, paddingBottom: 8, fontSize: 22, fontWeight: 800, letterSpacing: 0.2, textAlign: 'center' }}>Сервер</div>
      <div className="admin-scroll" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
        <div className="admin-fade admin-fade--top" />
        <MainPing />
        <RoutesHealth />
        <LocalMetricsPanel />
        <div className="admin-fade admin-fade--bottom" />
      </div>
      <AdminNav active="server" />
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: any }) {
  return (
    <div style={{ background: 'linear-gradient(180deg, #111, #0a0a0a)', border: '1px solid #1e1e1e', borderRadius: 16, padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 12, opacity: 0.7 }}>{subtitle}</div> : null}
      </div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  )
}

function LocalMetricsPanel() {
  const [m, setM] = useState<LocalMetrics | null>(null)
  useEffect(() => {
    startLocalMetrics()
    const off = subscribeLocalMetrics(setM)
    return off
  }, [])
  return (
    <div style={{ padding: '0 16px 16px' }}>
      <Section title="RPS (1m)" subtitle="Среднее за 60с">
        <div style={{ fontSize: 28, fontWeight: 800 }}>{m?.server.rps1m.toFixed(2) ?? '0.00'}</div>
      </Section>
      <Section title="Latency p95 (5m)" subtitle="по fetch()">
        <div style={{ fontSize: 28, fontWeight: 800 }}>{m?.server.p95ms5m != null ? Math.round(m.server.p95ms5m) + ' ms' : '—'}</div>
      </Section>
      <Section title="Error rate (5m)" subtitle="по fetch()">
        <div style={{ fontSize: 28, fontWeight: 800 }}>{m ? Math.round(m.server.errorRate5m * 100) + '%' : '0%'}</div>
      </Section>
      <Section title="Web Vitals" subtitle="из PerformanceObserver">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <KV k="LCP" v={m?.vitals.lcpMs != null ? Math.round(m.vitals.lcpMs) + ' ms' : '—'} />
          <KV k="FCP" v={m?.vitals.fcpMs != null ? Math.round(m.vitals.fcpMs) + ' ms' : '—'} />
          <KV k="CLS" v={m?.vitals.cls != null ? m.vitals.cls.toFixed(3) : '—'} />
          <KV k="TTFB" v={m?.vitals.ttfbMs != null ? Math.round(m.vitals.ttfbMs) + ' ms' : '—'} />
        </div>
      </Section>
    </div>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ background: '#0e0e0e', border: '1px solid #1e1e1e', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{k}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{v}</div>
    </div>
  )
}

function MainPing() {
  const [res, setRes] = useState<{ url: string; status: number; ms: number; ok: boolean } | null>(null)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/main_stats?domain=exampli.vercel.app&path=/')
        const j = await r.json()
        setRes(j)
      } catch {}
    })()
  }, [])
  return (
    <div style={{ padding: '0 16px 12px' }}>
      <div style={{ background: 'linear-gradient(180deg, #111, #0a0a0a)', border: '1px solid #1e1e1e', borderRadius: 16, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Главный сайт</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{res?.url ?? '—'}</div>
        </div>
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <KV k="Статус" v={res ? String(res.status) : '—'} />
          <KV k="Latency" v={res ? res.ms + ' ms' : '—'} />
        </div>
      </div>
    </div>
  )
}

function RoutesHealth() {
  const routes = ['/', '/ai', '/battle', '/quests', '/subscription', '/profile']
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => {
    (async () => {
      const out: any[] = []
      for (const p of routes) {
        try {
          const r = await fetch('/api/main_stats?domain=exampli.vercel.app&path=' + encodeURIComponent(p))
          const j = await r.json()
          out.push({ path: p, ...j })
        } catch {
          out.push({ path: p, status: 0, ms: 0, ok: false })
        }
      }
      setRows(out)
    })()
  }, [])
  const color = (ok: boolean, ms: number) => (ok && ms <= 400 ? 'green' : ok ? 'yellow' : 'red') as 'green' | 'yellow' | 'red'
  const bg = (c: 'green'|'yellow'|'red') => c==='green'?'#062a06':c==='yellow'?'#2a2a06':'#2a0606'
  const bd = (c: 'green'|'yellow'|'red') => c==='green'?'#0b590b':c==='yellow'?'#59590b':'#590b0b'
  return (
    <div style={{ padding: '0 16px 12px' }}>
      <div style={{ background: 'linear-gradient(180deg, #111, #0a0a0a)', border: '1px solid #1e1e1e', borderRadius: 16, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Маршруты главного проекта</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => {
            const c = color(Boolean(r.ok), Number(r.ms || 0))
            return (
              <div key={r.path} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center', background: bg(c), border: `1px solid ${bd(c)}`, borderRadius: 10, padding: 12 }}>
                <div style={{ minWidth: 0, whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{r.url || r.path}</div>
                <div style={{ opacity: 0.9 }}>{r.status ?? '—'}</div>
                <div style={{ fontWeight: 800 }}>{r.ms ? r.ms + ' ms' : '—'}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


