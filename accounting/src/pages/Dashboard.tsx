import { useEffect, useState } from 'react'
import { StatCard } from '@/components/StatCard'
import { BarChart } from '@/components/BarChart'
import { formatMoneyFromMinor } from '@/lib/format'
import { aggregateStats } from '@/lib/stats'
import { fetchPayments } from '@/lib/payments'
import { paymentsToIncome } from '@/lib/payments.adapter'

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [incomeMinorByMonth, setIncomeMinorByMonth] = useState<ReturnType<typeof aggregateStats> | null>(null)

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        setError(null)
        const rows = await fetchPayments(2000)
        const incomes = paymentsToIncome(rows)
        const stats = aggregateStats(incomes, [])
        setIncomeMinorByMonth(stats)
      } catch (e: any) {
        setError(e?.message || 'Ошибка загрузки платежей')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const currency = 'RUB' as const

  if (loading) return <div>Загрузка...</div>
  if (error) return <div className="text-red-600">{error}</div>
  const stats = incomeMinorByMonth || { totalsAllTime: { incomeMinor: 0, expenseMinor: 0 }, totalsThisMonth: { incomeMinor: 0, expenseMinor: 0 }, byMonth: [], byYear: [] }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Доходы за месяц" value={formatMoneyFromMinor(stats.totalsThisMonth.incomeMinor, currency)} />
        <StatCard label="Расходы за месяц" value={formatMoneyFromMinor(stats.totalsThisMonth.expenseMinor, currency)} />
        <StatCard label="Доходы за всё время" value={formatMoneyFromMinor(stats.totalsAllTime.incomeMinor, currency)} />
        <StatCard label="Расходы за всё время" value={formatMoneyFromMinor(stats.totalsAllTime.expenseMinor, currency)} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Доходы по месяцам</h2>
        <BarChart data={stats.byMonth} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Доходы/расходы по годам</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.byYear.map(y => (
            <StatCard key={y.year} label={`Год ${y.year}`} value={
              <div className="text-base">
                <div>Доходы: {formatMoneyFromMinor(y.incomeMinor, currency)}</div>
                <div className="text-gray-600">Расходы: {formatMoneyFromMinor(y.expenseMinor, currency)}</div>
              </div>
            } />
          ))}
        </div>
      </section>
    </div>
  )
}


