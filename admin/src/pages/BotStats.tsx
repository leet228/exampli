import { useEffect, useState } from 'react'
import AdminNav from '../components/AdminNav'

type DayRow = { day: string; count: number }

export default function BotStats() {
  const [today, setToday] = useState<number | null>(null)
  const [days, setDays] = useState<DayRow[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        const r = await fetch('/api/admin_stats')
        const j = await r.json()
        if (!r.ok || j?.ok === false) throw new Error(j?.error || 'failed')
        setToday(j?.today ?? 0)
        setDays(Array.isArray(j?.days) ? j.days : [])
      } catch (e: any) {
        setError(String(e?.message || e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="admin-page">
      <div style={{ padding: '0 20px 8px', fontSize: 22, fontWeight: 800, letterSpacing: 0.2, textAlign: 'center' }}>Bot Stats</div>
      <div className="admin-scroll" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
      <div style={{ padding: 24 }}>
      {loading && <div>Loading…</div>}
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
      {!loading && !error && (
        <>
          <div style={{ marginTop: 12, fontSize: 18 }}>DM today: <b>{today}</b></div>
          <div style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr><th style={{ textAlign: 'left', paddingRight: 16 }}>Day</th><th>Count</th></tr>
              </thead>
              <tbody>
                {days.map((d, i) => (
                  <tr key={i}><td style={{ paddingRight: 16 }}>{d.day}</td><td style={{ textAlign: 'right' }}>{d.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      </div>
      </div>
      <AdminNav active="bot" />
    </div>
  )
}


