import { useEffect, useMemo, useState } from 'react'
import AdminNav from '../components/AdminNav'

type Payment = {
  id: string
  user_id: string | null
  type: 'gems' | 'plan'
  product_id: string | null
  amount_rub: number
  currency: string
  status: string
  test: boolean
  created_at: string
  captured_at: string | null
}

type Summary = {
  balance: number
  grossMonth: number
  grossToday: number
}

export default function Revenue() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Payment[]>([])
  const [range, setRange] = useState<'month' | 'week' | 'day'>('month')

  async function load() {
    try {
      const r = await fetch('/api/revenue', { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || `${r.status}`)
      setRows(Array.isArray(j?.rows) ? j.rows : [])
      setError(null)
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const summary: Summary = useMemo(() => {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    let balance = 0, grossMonth = 0, grossToday = 0
    for (const r of rows) {
      const ok = r.status === 'succeeded' && !r.test
      if (!ok) continue
      const ts = Date.parse(r.captured_at || r.created_at)
      balance += Number(r.amount_rub || 0)
      if (ts >= startOfMonth) grossMonth += Number(r.amount_rub || 0)
      if (ts >= startOfDay) grossToday += Number(r.amount_rub || 0)
    }
    return { balance, grossMonth, grossToday }
  }, [rows])

  const bars = useMemo(() => {
    const now = new Date()
    const points: { x: string; y: number }[] = []
    if (range === 'month') {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const acc = new Array(daysInMonth).fill(0)
      for (const r of rows) {
        if (r.status !== 'succeeded' || r.test) continue
        const dt = new Date(r.captured_at || r.created_at)
        if (dt.getMonth() !== now.getMonth() || dt.getFullYear() !== now.getFullYear()) continue
        const d = dt.getDate()
        acc[d - 1] += Number(r.amount_rub || 0)
      }
      for (let i = 1; i <= daysInMonth; i++) points.push({ x: String(i), y: acc[i - 1] })
    } else if (range === 'week') {
      const acc = new Array(7).fill(0)
      for (const r of rows) {
        if (r.status !== 'succeeded' || r.test) continue
        const dt = new Date(r.captured_at || r.created_at)
        const diff = Math.floor((Date.now() - dt.getTime()) / 86400000)
        if (diff >= 7 || diff < 0) continue
        acc[6 - diff] += Number(r.amount_rub || 0)
      }
      const labels = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']
      for (let i = 0; i < 7; i++) points.push({ x: labels[i], y: acc[i] })
    } else {
      const acc = new Array(24).fill(0)
      for (const r of rows) {
        if (r.status !== 'succeeded' || r.test) continue
        const dt = new Date(r.captured_at || r.created_at)
        if (dt.toDateString() !== new Date().toDateString()) continue
        acc[dt.getHours()] += Number(r.amount_rub || 0)
      }
      for (let h = 0; h < 24; h++) points.push({ x: String(h), y: acc[h] })
    }
    return points
  }, [rows, range])

  return (
    <div className="admin-page">
      <div style={{ padding: '0 20px 8px', fontSize: 22, fontWeight: 800, letterSpacing: 0.2, textAlign: 'center' }}>Доходы</div>
      <div className="admin-scroll" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
        <div className="admin-fade admin-fade--top" />
        <div style={{ padding: '0 24px 16px' }}>
          {loading ? (
            <div style={{ opacity: 0.7 }}>Загрузка…</div>
          ) : error ? (
            <div style={{ color: '#ff4d4d' }}>{error}</div>
          ) : (
            <>
              <BalanceCard amount={summary.balance} onRefresh={() => { setLoading(true); load() }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <MiniCard title="За месяц" amount={summary.grossMonth} />
                <MiniCard title="Сегодня" amount={summary.grossToday} />
              </div>
              <ChartCard points={bars} range={range} onRangeChange={setRange} />
              <Bookkeeping rows={rows} />
              <RecentList rows={rows} />
            </>
          )}
        </div>
        <div className="admin-fade admin-fade--bottom" />
      </div>
      <AdminNav active="revenue" />
    </div>
  )
}

function BalanceCard({ amount, onRefresh }: { amount: number; onRefresh: () => void }) {
  return (
    <div style={{ background: 'linear-gradient(180deg, #1a1a1a, #0a0a0a)', border: '1px solid #242424', borderRadius: 16, padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Баланс</div>
          <div style={{ fontSize: 34, fontWeight: 900, marginTop: 4 }}>{amount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })}</div>
        </div>
        <button className="btn" onClick={onRefresh} style={{ background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: 12, padding: '8px 12px' }}>Обновить</button>
      </div>
    </div>
  )
}

function MiniCard({ title, amount }: { title: string; amount: number }) {
  return (
    <div style={{ background: 'linear-gradient(180deg, #111, #0a0a0a)', border: '1px solid #1e1e1e', borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{amount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })}</div>
    </div>
  )
}

function ChartCard({ points, range, onRangeChange }: { points: { x: string; y: number }[]; range: 'month' | 'week' | 'day'; onRangeChange: (r: 'month' | 'week' | 'day') => void }) {
  const max = Math.max(1, ...points.map(p => p.y))
  const chartHeight = 220
  const maxBar = chartHeight - 70 // запас под подписи
  const step = points.length > 20 ? Math.ceil(points.length / 10) : 1 // показываем подписи через шаг
  return (
    <div style={{ background: 'linear-gradient(180deg, #111, #0a0a0a)', border: '1px solid #1e1e1e', borderRadius: 14, padding: 16, margin: '14px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' as any }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Динамика</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as any }}>
          {(['day','week','month'] as const).map(k => (
            <button key={k} className={`btn${k===range?' btn--primary':''}`} onClick={() => onRangeChange(k)}>{k==='day'?'День':k==='week'?'Неделя':'Месяц'}</button>
          ))}
        </div>
      </div>
      <div style={{ paddingTop: 12 }}>
        <div
          style={{
            height: chartHeight,
            display: 'grid',
            gridTemplateColumns: `repeat(${points.length}, 1fr)`,
            alignItems: 'end',
            gap: 2,
          }}
        >
          {points.map((p, i) => {
            const h = Math.max(3, Math.round((p.y / max) * maxBar))
            const color = i === points.length - 1 ? '#7dd3fc' : '#e5e7eb'
            const label = i % step === 0 ? p.x : ''
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: 9, lineHeight: '10px', height: 10, overflow: 'hidden', opacity: 0.7 }}>{p.y ? p.y.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : ''}</div>
                <div style={{ width: '60%', height: h, borderRadius: 3, background: color }} />
                <div style={{ fontSize: 9, lineHeight: '10px', height: 10, overflow: 'hidden', opacity: 0.6, marginTop: 4 }}>{label}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function RecentList({ rows }: { rows: Payment[] }) {
  const last = rows
    .filter(r => r.status === 'succeeded' && !r.test)
    .sort((a,b) => Date.parse(b.captured_at || b.created_at) - Date.parse(a.captured_at || a.created_at))
    .slice(0, 50)
  return (
    <div style={{ background: 'linear-gradient(180deg, #111, #0a0a0a)', border: '1px solid #1e1e1e', borderRadius: 14, padding: 16, marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Последние платежи</div>
        <a href="#" style={{ fontSize: 12, opacity: 0.7 }}>Смотреть все</a>
      </div>
      <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
        {last.map(p => (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{p.type === 'plan' ? 'Подписка' : 'Монеты'}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{new Date(p.captured_at || p.created_at).toLocaleString('ru-RU')}</div>
            </div>
            <div style={{ fontWeight: 800 }}>{Number(p.amount_rub||0).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Bookkeeping({ rows }: { rows: Payment[] }) {
  const now = new Date()
  const years = Array.from(new Set(rows.map(r => new Date(r.captured_at || r.created_at).getFullYear()))).sort((a,b)=>b-a)
  if (years.length === 0) years.push(now.getFullYear())
  const [year, setYear] = useState<number>(years[0])
  const [month, setMonth] = useState<number>(now.getMonth()+1)

  const monthTotal = useMemo(() => {
    return rows.reduce((acc, r) => {
      if (r.status !== 'succeeded' || r.test) return acc
      const d = new Date(r.captured_at || r.created_at)
      const y = d.getFullYear(), m = d.getMonth()+1
      if (y === year && m === month) acc += Number(r.amount_rub || 0)
      return acc
    }, 0)
  }, [rows, year, month])

  const monthRows = useMemo(() => rows
    .filter(r => r.status === 'succeeded' && !r.test)
    .filter(r => { const d = new Date(r.captured_at || r.created_at); return d.getFullYear()===year && (d.getMonth()+1)===month })
    .sort((a,b)=>Date.parse(b.captured_at||b.created_at)-Date.parse(a.captured_at||a.created_at))
    .slice(0, 50)
  , [rows, year, month])

  return (
    <div style={{ background: 'linear-gradient(180deg, #111, #0a0a0a)', border: '1px solid #1e1e1e', borderRadius: 14, padding: 16, marginTop: 8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems: 'center', gap: 8, flexWrap:'wrap' as any }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Бухгалтерия</div>
        <div style={{ display:'flex', gap: 8, flexWrap:'wrap' as any }}>
          <select value={year} onChange={e=>setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={month} onChange={e=>setMonth(Number(e.target.value))}>
            {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginTop: 10, display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center' }}>
        <div style={{ opacity:0.7 }}>Итого за месяц</div>
        <div style={{ fontWeight: 900 }}>{monthTotal.toLocaleString('ru-RU', { style:'currency', currency:'RUB', maximumFractionDigits:0 })}</div>
      </div>
      <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
        {monthRows.map(p => (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{p.type === 'plan' ? 'Подписка' : 'Монеты'}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{new Date(p.captured_at || p.created_at).toLocaleString('ru-RU')}</div>
            </div>
            <div style={{ fontWeight: 800 }}>{Number(p.amount_rub||0).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })}</div>
          </div>
        ))}
        {monthRows.length === 0 ? <div style={{ opacity:0.6 }}>Нет платежей за выбранный период</div> : null}
      </div>
    </div>
  )
}


