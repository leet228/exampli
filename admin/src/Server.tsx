import { useEffect, useState } from 'react'
import AdminNav from './components/AdminNav'

export default function Server() {
  return (
    <div className="admin-page">
      <div style={{ padding: 16, paddingBottom: 8, fontSize: 22, fontWeight: 800, letterSpacing: 0.2, textAlign: 'center' }}>Сервер</div>
      <div className="admin-scroll" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
        <div className="admin-fade admin-fade--top" />
        <AlertsBanner />
        <div style={{ padding: '0 16px 16px' }}>
          <Section title="RPS (5m)" subtitle="Запросы/сек по сервису">
            <PromInline query={'sum(rate(http_requests_total[5m]))'} />
          </Section>
          <Section title="Latency p95 (5m)" subtitle="Прометеевский histogram_quantile">
            <PromInline query={'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))'} />
          </Section>
          <Section title="Error rate (5xx) (5m)" subtitle="Доля 5xx от всех">
            <PromInline query={'sum(rate(http_requests_total{code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))'} />
          </Section>
        </div>
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

function PromInline({ query }: { query: string }) {
  const [text, setText] = useState<string>('…')
  useEffect(() => {
    (async () => {
      try {
        // const now = Math.floor(Date.now() / 1000)
        const url = '/api/prom_query?q=' + encodeURIComponent(query)
        const r = await fetch(url)
        const j = await r.json()
        const val = j?.data?.result?.[0]?.value?.[1]
        setText(val != null ? String(val) : '—')
      } catch {
        setText('—')
      }
    })()
  }, [query])
  return <div style={{ fontSize: 28, fontWeight: 800 }}>{text}</div>
}

function AlertsBanner() {
  const [alerts, setAlerts] = useState<any[]>([])
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/prom_query?q=' + encodeURIComponent('ALERTS'))
        const j = await r.json()
        const arr = Array.isArray(j?.data?.result) ? j.data.result : []
        setAlerts(arr)
      } catch {
        setAlerts([])
      }
    })()
  }, [])
  if (!alerts.length) return null
  return (
    <div style={{ padding: '0 16px 12px' }}>
      <div style={{ background: '#2a0000', border: '1px solid #550000', color: '#fff', borderRadius: 12, padding: 12 }}>
        Активные алерты: {alerts.length}
      </div>
    </div>
  )
}


