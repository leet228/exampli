import { useEffect, useState } from 'react'

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

  return (
    <div style={{ minHeight: '100dvh', background: '#000', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 16, fontSize: 24, fontWeight: 700 }}>АДМИН</div>
      <div style={{ flex: 1, padding: 16 }}>
        {loading ? (
          <div style={{ opacity: 0.7 }}>Загрузка…</div>
        ) : error ? (
          <div style={{ color: '#ff4d4d' }}>{error}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
            <Card title="Пользователей всего" value={stats?.total ?? 0} />
            <Card title="Онлайн (5 мин)" value={stats?.online ?? 0} />
            <Card title="Новых за 24ч" value={stats?.new24h ?? 0} />
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}

function Card({ title, value }: { title: string; value: number }) {
  return (
    <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: 16, textAlign: 'left' }}>
      <div style={{ fontSize: 13, opacity: 0.8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{value.toLocaleString('ru-RU')}</div>
    </div>
  )
}

function BottomNav() {
  return (
    <div style={{ borderTop: '1px solid #222', padding: 8, display: 'flex', gap: 8 }}>
      <a href="/admin" style={{ flex: 1, textDecoration: 'none', color: '#fff', background: '#111', border: '1px solid #222', borderRadius: 10, padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>Обзор</a>
      <a href="/admin/server" style={{ flex: 1, textDecoration: 'none', color: '#000', background: '#fff', border: '1px solid #222', borderRadius: 10, padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>Сервер</a>
    </div>
  )
}


