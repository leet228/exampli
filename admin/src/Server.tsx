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
        <VercelLogsPanel />
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
  const [weeklyErr, setWeeklyErr] = useState<number | null>(null)
  useEffect(() => {
    startLocalMetrics()
    const off = subscribeLocalMetrics(setM)
    return off
  }, [])
  // fetch weekly error rate from vercel logs summary
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/vercel_logs?project=exampli&domain=exampli.vercel.app&range=7d&summary=1')
        const j = await r.json()
        if (j?.summary && typeof j.summary.errorRate === 'number') setWeeklyErr(j.summary.errorRate)
      } catch {}
    })()
  }, [])
  return (
    <div style={{ padding: '0 16px 16px' }}>
      <Section title="RPS (1m)" subtitle="Среднее за 60с">
        <div style={{ fontSize: 28, fontWeight: 800 }}>{m?.server.rps1m.toFixed(2) ?? '0.00'}</div>
      </Section>
      <Section title="Latency p95 (5m)" subtitle="по fetch()">
        <div style={{ fontSize: 28, fontWeight: 800 }}>{m?.server.p95ms5m != null ? Math.round(m.server.p95ms5m) + ' ms' : '—'}</div>
      </Section>
      <Section title="Error rate (7d)" subtitle="из логов Vercel">
        <div style={{ fontSize: 28, fontWeight: 800 }}>{weeklyErr != null ? Math.round(weeklyErr * 100) + '%' : '—'}</div>
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

function VercelLogsPanel() {
  const [range, setRange] = useState<'24h' | '7d'>('24h')
  const [rows, setRows] = useState<Array<{ ts: string; level: string; message: string; source?: string | null; path?: string | null; status?: number | null }>>([])
  const [meta, setMeta] = useState<{ deployment?: { id: string; url: string } | null; loading: boolean; error: string | null }>({ deployment: null, loading: true, error: null })
  const [expanded, setExpanded] = useState(false)

  async function load(rng: '24h' | '7d') {
    setMeta(m => ({ ...m, loading: true, error: null }))
    try {
      const r = await fetch('/api/vercel_logs?project=exampli&domain=exampli.vercel.app&range=' + rng)
      const j = await r.json()
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'load_failed')
      setRows(j.rows || [])
      setMeta({ deployment: j.deployment || null, loading: false, error: null })
    } catch (e: any) {
      setRows([])
      setMeta({ deployment: null, loading: false, error: e?.message || 'Ошибка загрузки логов' })
    }
  }

  useEffect(() => { load(range) }, [range])

  const levelColor = (lvl: string) => lvl === 'error' || lvl === 'critical' ? '#ff4d4d' : (lvl === 'warn' || lvl === 'warning') ? '#f3c969' : '#9ad97a'

  return (
    <div style={{ padding: '0 16px 12px' }}>
      <Section title="Логи Vercel" subtitle={meta.deployment?.url ? `деплой ${meta.deployment.url}` : undefined}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={() => setRange('24h')} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a2a2a', background: range==='24h'?'#1a1a1a':'#0f0f0f' }}>24 часа</button>
          <button onClick={() => setRange('7d')} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a2a2a', background: range==='7d'?'#1a1a1a':'#0f0f0f' }}>7 дней</button>
        </div>
        {meta.loading ? (
          <div style={{ opacity: 0.7 }}>Загрузка логов…</div>
        ) : meta.error ? (
          <div style={{ color: '#ff4d4d' }}>{meta.error}</div>
        ) : rows.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Логи не найдены за выбранный период</div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 8 }}>
              {(expanded ? rows : rows.slice(0, 10)).map((l, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 60px 1fr', gap: 10, alignItems: 'start', background: '#0e0e0e', border: '1px solid #1e1e1e', borderRadius: 10, padding: 10, maxWidth: '100%', overflowX: 'hidden' }}>
                  <div style={{ fontSize: 12, opacity: 0.7, whiteSpace: 'nowrap' }}>{new Date(l.ts).toLocaleString('ru-RU')}</div>
                  <div style={{ fontSize: 12, color: levelColor(l.level), whiteSpace: 'nowrap' }}>{l.level.toUpperCase()}</div>
                  <div style={{ fontSize: 13, opacity: 0.95, minWidth: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere', display: expanded ? 'block' : '-webkit-box', WebkitLineClamp: expanded ? undefined : 2 as any, WebkitBoxOrient: 'vertical' as any, overflow: expanded ? 'visible' : 'hidden' }}>
                    {l.path ? <span style={{ opacity: 0.7, marginRight: 6 }}>{l.path}</span> : null}
                    {l.status ? <span style={{ opacity: 0.7, marginRight: 6 }}>[{l.status}]</span> : null}
                    {l.message}
                  </div>
                </div>
              ))}
            </div>
            {rows.length > 10 ? (
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
                <button onClick={() => setExpanded((v) => !v)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #2a2a2a', background: '#0f0f0f', fontWeight: 700 }}>
                  {expanded ? 'Свернуть' : 'Посмотреть всё'}
                </button>
              </div>
            ) : null}
          </>
        )}
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


