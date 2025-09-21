import { useEffect, useState } from 'react'
import AdminNav from './components/AdminNav'

type UsersStats = { total: number; online: number; new24h: number }

export default function Admin() {
  const [stats, setStats] = useState<UsersStats | null>(null)
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
              <Card title="Онлайн" subtitle="последние 5 мин" value={stats?.online ?? 0} />
              <Card title="Новые" subtitle="за 24 часа" value={stats?.new24h ?? 0} />
            </>
          )}

          <WideCard title="Активность" valueLabel="DAU/WAU/MAU" hint="подключим позже" />
          <WideCard title="Retention" valueLabel="D1/D7/D30" hint="подключим позже" />
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

function WideCard({ title, valueLabel, hint }: { title: string; valueLabel?: string; hint?: string }) {
  return (
    <div style={{ background: 'linear-gradient(180deg, #111, #0a0a0a)', border: '1px solid #1e1e1e', borderRadius: 16, padding: 16, textAlign: 'left', boxShadow: '0 8px 20px rgba(0,0,0,0.35)', overflow: 'hidden', width: '100%', margin: '0 0 14px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {valueLabel ? <div style={{ fontSize: 12, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valueLabel}</div> : null}
      </div>
      {hint ? <div style={{ fontSize: 12, opacity: 0.6, marginTop: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hint}</div> : null}
      <div style={{ height: 140, marginTop: 10, borderRadius: 8, background: 'repeating-linear-gradient(90deg, #0f0f0f, #0f0f0f 10px, #0c0c0c 10px, #0c0c0c 20px)' }} />
    </div>
  )
}


