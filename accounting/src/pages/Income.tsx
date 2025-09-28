import { useEffect, useMemo, useState } from 'react'
import { DataTable } from '@/components/DataTable'
import { formatMoneyFromMinor } from '@/lib/format'
import { fetchPayments } from '@/lib/payments'
import { paymentsToIncome } from '@/lib/payments.adapter'
import { ExportButtons } from '@/components/ExportButtons'

export default function IncomePage() {
  const [rows, setRows] = useState<ReturnType<typeof paymentsToIncome>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        setError(null)
        const payments = await fetchPayments(2000)
        setRows(paymentsToIncome(payments))
      } catch (e: any) {
        setError(e?.message || 'Ошибка загрузки')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return <div>Загрузка...</div>
  if (error) return <div className="text-red-600">{error}</div>

  const rawRows = useMemo(() => rows.map(r => ({
    id: r.id,
    user_id: r.userId,
    date: r.dateIso,
    amount_rub: Math.round(r.amountMinor) / 100,
    currency: r.currency,
    operation: r.operation,
  })), [rows])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Учет доходов</h1>
      <ExportButtons fileBase={`income-${new Date().toISOString().slice(0,10)}`} rawRows={rawRows} />
      <DataTable
        rows={rows}
        getKey={(r) => r.id}
        columns={[
          { key: 'dateIso', header: 'Дата' },
          { key: 'userId', header: 'Пользователь' },
          { key: 'operation', header: 'Операция' },
          { key: 'amountMinor', header: 'Сумма', render: (r) => formatMoneyFromMinor(r.amountMinor, r.currency) },
          { key: 'paymentSystemFeeMinor', header: 'Комиссия', render: (r) => r.paymentSystemFeeMinor ? formatMoneyFromMinor(r.paymentSystemFeeMinor, r.currency) : '—' },
        ]}
      />
    </div>
  )
}


