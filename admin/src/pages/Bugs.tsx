import { useEffect, useState } from 'react'
import AdminNav from '../components/AdminNav'

type Bug = { id: string; created_at: string; tg_id: string | null; text: string; images: string[] }

export default function Bugs() {
  const [items, setItems] = useState<Bug[]>([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadMore() {
    if (loading || done) return
    setLoading(true)
    try {
      const from = page * 10
      const to = from + 9
      const r = await fetch(`/api/bugs_list?from=${from}&to=${to}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'failed')
      const rows: Bug[] = Array.isArray(j?.rows) ? j.rows : []
      setItems(prev => [...prev, ...rows])
      setPage(prev => prev + 1)
      if (rows.length < 10) setDone(true)
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadMore() }, [])

  return (
    <div className="admin-page">
      <div style={{ padding: '0 20px 8px', fontSize: 22, fontWeight: 800, letterSpacing: 0.2, textAlign: 'center' }}>Баги</div>
      <div className="admin-scroll" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
        <div style={{ padding: 16 }}>
          {items.map((b) => (
            <div key={b.id} style={{ background: 'linear-gradient(180deg,#111,#0a0a0a)', border: '1px solid #1e1e1e', borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{new Date(b.created_at).toLocaleString('ru-RU')}</div>
              {b.tg_id && <div style={{ fontSize: 12, opacity: 0.7 }}>tg_id: {b.tg_id}</div>}
              <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{b.text}</div>
              {Array.isArray(b.images) && b.images.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {b.images.map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="att" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8 }} /></a>
                  ))}
                </div>
              )}
            </div>
          ))}
          {!done && (
            <button disabled={loading} onClick={loadMore} style={{ background: '#222', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 10 }}>{loading ? 'Загрузка…' : 'Загрузить ещё'}</button>
          )}
          {error && <div style={{ color: 'red', marginTop: 12 }}>Ошибка: {error}</div>}
        </div>
    </div>
      <AdminNav active="bugs" />
    </div>
  )
}


