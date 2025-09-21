import { useEffect, useState } from 'react'
import AdminNav from './components/AdminNav'

type UsersStats = { total: number; online: number; new24h: number }

export default function Admin() {
  const [stats, setStats] = useState<UsersStats | null>(null)
  const [onlineNow, setOnlineNow] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/users_stats')
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error || 'failed')
        setStats(j)
        setError(null)
      } catch (e: any) {
        setError(e?.message || 'Ошибка загрузки')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Онлайн «живьём» с /api/online, автообновление раз в 15с
  useEffect(() => {
    let stop = false
    const tick = async () => {
      try {
        const r = await fetch('/api/online', { cache: 'no-store' })
        const j = await r.json()
        if (!stop) setOnlineNow(Number(j?.online || 0))
      } catch {}
    }
    tick()
    const id = setInterval(tick, 15000)
    return () => { stop = true; clearInterval(id) }
  }, [])

  // свайпы между страницами отключены, оставляем вертикальный скролл

  return (
    <div className="admin-page">
      <div style={{ padding: '0 20px 8px', fontSize: 22, fontWeight: 800, letterSpacing: 0.2, textAlign: 'center' }}>Обзор</div>
      <div className="admin-scroll" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
        <div className="admin-fade admin-fade--top" />
        <div style={{ padding: '0 24px 16px' }}>
          {loading ? (
            <div style={{ opacity: 0.7 }}>Загрузка…</div>
          ) : error ? (
            <div style={{ color: '#ff4d4d' }}>{error}</div>
          ) : (
            <>
              <Card title="Пользователи" subtitle="Всего" value={stats?.total ?? 0} />
              <Card title="Онлайн" subtitle="последние 5 мин (живьём)" value={onlineNow ?? stats?.online ?? 0} />
              <Card title="Новые" subtitle="за 24 часа" value={stats?.new24h ?? 0} />
            </>
          )}

          <Activity />
          <Retention />
        </div>
        <div className="admin-fade admin-fade--bottom" />
      </div>
      <AdminNav active="overview" />
    </div>
  )
}

function Card({ title, subtitle, value }: { title: string; subtitle?: string; value: number }) {
  return (
    <div style={{ background: 'linear-gradient(180deg, #111, #0a0a0a)', border: '1px solid #1e1e1e', borderRadius: 16, padding: 16, textAlign: 'left', boxShadow: '0 8px 20px rgba(0,0,0,0.35)', overflow: 'hidden', width: '100%', margin: '0 0 14px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 13, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 12, opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div> : null}
      </div>
      <div style={{ fontSize: 34, fontWeight: 900, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value.toLocaleString('ru-RU')}</div>
    </div>
  )
}

// WideCard удалён — заменён на Activity/Retention

function Badge({ label, value, color }: { label: string; value: string; color: 'green' | 'yellow' | 'red' }) {
  const bg = color === 'green' ? '#062a06' : color === 'yellow' ? '#2a2a06' : '#2a0606'
  const bd = color === 'green' ? '#0b590b' : color === 'yellow' ? '#59590b' : '#590b0b'
  return (
    <div style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
    </div>
  )
}

function Activity() {
  const [a, setA] = useState<any | null>(null)
  useEffect(() => { (async () => { try { const r = await fetch('/api/users_activity'); const j = await r.json(); setA(j) } catch {} })() }, [])
  if (!a) return <div style={{ opacity: 0.7, padding: 16 }}>Загрузка активности…</div>
  const color = (n: number) => (n > 100 ? 'green' : n > 20 ? 'yellow' : 'red') as 'green' | 'yellow' | 'red'
  return (
    <div style={{ background: 'linear-gradient(180deg, #111, #0a0a0a)', border: '1px solid #1e1e1e', borderRadius: 14, padding: 16, margin: '0 0 14px' }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Активность</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Badge label="DAU" value={(a?.dau ?? 0).toLocaleString('ru-RU')} color={color(a?.dau ?? 0)} />
        <Badge label="WAU" value={(a?.wau ?? 0).toLocaleString('ru-RU')} color={color(a?.wau ?? 0)} />
        <Badge label="MAU" value={(a?.mau ?? 0).toLocaleString('ru-RU')} color={color(a?.mau ?? 0)} />
      </div>
    </div>
  )
}

function Retention() {
  const [a, setA] = useState<any | null>(null)
  useEffect(() => { (async () => { try { const r = await fetch('/api/users_activity'); const j = await r.json(); setA(j?.retention) } catch {} })() }, [])
  if (!a) return <div style={{ opacity: 0.7, padding: 16 }}>Загрузка retention…</div>
  const pc = (x: number | null) => (x == null ? '—' : Math.round(x * 100) + '%')
  const color = (x: number | null) => (x == null ? 'red' : x >= 0.4 ? 'green' : x >= 0.2 ? 'yellow' : 'red') as 'green' | 'yellow' | 'red'
  return (
    <div style={{ background: 'linear-gradient(180deg, #111, #0a0a0a)', border: '1px solid #1e1e1e', borderRadius: 14, padding: 16, margin: '0 0 14px' }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Retention</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Badge label="D1" value={pc(a?.d1?.rate ?? null)} color={color(a?.d1?.rate ?? null)} />
        <Badge label="D7" value={pc(a?.d7?.rate ?? null)} color={color(a?.d7?.rate ?? null)} />
        <Badge label="D30" value={pc(a?.d30?.rate ?? null)} color={color(a?.d30?.rate ?? null)} />
      </div>
    </div>
  )
}

