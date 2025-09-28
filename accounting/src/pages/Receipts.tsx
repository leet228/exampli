import { useEffect, useState } from 'react'
import { DataTable } from '@/components/DataTable'
import { fetchPayments } from '@/lib/payments'

export default function ReceiptsPage() {
  const [rows, setRows] = useState<{ id: string; paymentId: string; dateIso: string; url: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        setError(null)
        const payments = await fetchPayments(2000)
        const mapped = payments
          .filter(p => (p.status || '').toLowerCase() === 'succeeded')
          .map(p => ({ id: p.id, paymentId: p.id, dateIso: p.captured_at || '', url: '#' }))
        setRows(mapped)
      } catch (e: any) {
        setError(e?.message || 'Ошибка загрузки')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return <div>Загрузка...</div>
  if (error) return <div className="text-red-600">{error}</div>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Чеки / квитанции</h1>
      <DataTable
        rows={rows}
        getKey={(r) => r.id}
        columns={[
          { key: 'dateIso', header: 'Дата' },
          { key: 'paymentId', header: 'Платеж' },
          { key: 'url', header: 'Ссылка', render: (r) => <a className="text-blue-600" href={r.url} target="_blank" rel="noreferrer">Открыть</a> },
        ]}
      />
    </div>
  )
}


