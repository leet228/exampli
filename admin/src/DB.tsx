import { useEffect, useState } from 'react'
import AdminNav from './components/AdminNav'

type DbOverview = {
  new24h: number
  new7d: number
  storage: { buckets: { name: string; public: boolean; created_at: string }[] }
  dbPingMs: number
  readLatencyMs: number | null
  storageTest: { uploadMs: number | null; downloadMs: number | null; sizeBytes: number }
}

export default function DB() {
  const [data, setData] = useState<DbOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/db_overview')
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error || 'failed')
        setData(j)
      } catch (e: any) {
        setError(e?.message || 'Ошибка загрузки')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="admin-page">
      <div style={{ padding: 16, paddingBottom: 8, fontSize: 22, fontWeight: 800, textAlign: 'center' }}>База данных</div>
      <div className="admin-scroll" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
        <div className="admin-fade admin-fade--top" />
        <div style={{ padding: '0 16px 16px' }}>
          {loading ? (
            <div style={{ opacity: 0.8 }}>Загрузка…</div>
          ) : error ? (
            <div style={{ color: '#ff4d4d' }}>{error}</div>
          ) : data ? (
            <>
              <Section title="Сводка БД">
                <Grid2>
                  <BadgeKV k="DB ping" v={`${data.dbPingMs} ms`} color={colorByMs(data.dbPingMs, 80, 200)} />
                  <BadgeKV k="Read latency (1 row)" v={msOrDash(data.readLatencyMs)} color={colorByNullableMs(data.readLatencyMs, 100, 250)} />
                  <BadgeKV k="Storage upload 128KB" v={msOrDash(data.storageTest.uploadMs)} color={colorByNullableMs(data.storageTest.uploadMs, 200, 500)} />
                  <BadgeKV k="Storage download 128KB" v={msOrDash(data.storageTest.downloadMs)} color={colorByNullableMs(data.storageTest.downloadMs, 150, 400)} />
                </Grid2>
              </Section>

              <Section title="Storage Buckets">
                {data.storage.buckets.length ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {data.storage.buckets.map(b => (
                      <Row key={b.name} left={b.name} right={b.public ? 'public' : 'private'} sub={new Date(b.created_at).toLocaleString()} />
                    ))}
                  </div>
                ) : (
                  <div style={{ opacity: 0.7 }}>Нет бакетов</div>
                )}
              </Section>

              <Section title="Активность в users (прокси)">
                <Grid2>
                  <BadgeKV k="Новых за 24ч" v={toStr(data.new24h)} color={colorByValue(data.new24h, 1, 10)} />
                  <BadgeKV k="Новых за 7д" v={toStr(data.new7d)} color={colorByValue(data.new7d, 5, 70)} />
                </Grid2>
              </Section>
            </>
          ) : null}
        </div>
        <div className="admin-fade admin-fade--bottom" />
      </div>
      <AdminNav active="db" />
    </div>
  )
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div style={{ background: 'linear-gradient(180deg, #111, #0a0a0a)', border: '1px solid #1e1e1e', borderRadius: 16, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

// Reserved simple KV if потребуется
// function KV({ k, v }: { k: string; v: string }) {
//   return (
//     <div style={{ background: '#0e0e0e', border: '1px solid #1e1e1e', borderRadius: 10, padding: 12 }}>
//       <div style={{ fontSize: 12, opacity: 0.7 }}>{k}</div>
//       <div style={{ fontSize: 18, fontWeight: 800 }}>{v}</div>
//     </div>
//   )
// }

function BadgeKV({ k, v, color }: { k: string; v: string; color: 'green' | 'yellow' | 'red' }) {
  const bg = color === 'green' ? '#062a06' : color === 'yellow' ? '#2a2a06' : '#2a0606'
  const bd = color === 'green' ? '#0b590b' : color === 'yellow' ? '#59590b' : '#590b0b'
  return (
    <div style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{k}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{v}</div>
    </div>
  )
}

function Grid2({ children }: { children: any }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
}

function Row({ left, right, sub }: { left: string; right?: string; sub?: string }) {
  return (
    <div style={{ background: '#0e0e0e', border: '1px solid #1e1e1e', borderRadius: 10, padding: 12, display: 'grid', gridTemplateColumns: '1fr auto' }}>
      <div>
        <div style={{ fontWeight: 700 }}>{left}</div>
        {sub ? <div style={{ fontSize: 12, opacity: 0.7 }}>{sub}</div> : null}
      </div>
      {right ? <div style={{ opacity: 0.9, fontSize: 12 }}>{right}</div> : null}
    </div>
  )
}

function toStr(n: number) { return n.toLocaleString('ru-RU') }
function msOrDash(ms: number | null) { return ms != null ? `${ms} ms` : '—' }
function colorByValue(v: number, low: number, good: number): 'green' | 'yellow' | 'red' {
  if (v >= good) return 'green'
  if (v >= low) return 'yellow'
  return 'red'
}
function colorByMs(ms: number, good: number, meh: number): 'green' | 'yellow' | 'red' {
  if (ms <= good) return 'green'
  if (ms <= meh) return 'yellow'
  return 'red'
}
function colorByNullableMs(ms: number | null, good: number, meh: number): 'green' | 'yellow' | 'red' {
  if (ms == null) return 'red'
  return colorByMs(ms, good, meh)
}


