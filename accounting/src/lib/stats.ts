import type { IncomeRecord, ExpenseRecord, GroupedStats, MonthlyStat, Totals } from './types'
import { parseISO, ymKey } from './format'

// keep minimal helpers only; merge totals if needed

export function aggregateStats(incomes: IncomeRecord[], expenses: ExpenseRecord[], now = new Date()): GroupedStats {
  const byMonthMap = new Map<string, MonthlyStat>()
  const byYearMap = new Map<number, { year: number; incomeMinor: number; expenseMinor: number }>()

  let totalsAllTime: Totals = { incomeMinor: 0, expenseMinor: 0 }
  let totalsThisMonth: Totals = { incomeMinor: 0, expenseMinor: 0 }

  const nowYm = ymKey(now)

  for (const inc of incomes) {
    const d = parseISO(inc.dateIso)
    const ym = ymKey(d)
    const y = d.getFullYear()
    const fee = inc.paymentSystemFeeMinor ?? 0
    const net = inc.amountMinor - fee

    totalsAllTime.incomeMinor += net
    if (ym === nowYm) totalsThisMonth.incomeMinor += net

    const m = byMonthMap.get(ym) ?? { year: y, month: d.getMonth() + 1, incomeMinor: 0, expenseMinor: 0 }
    m.incomeMinor += net
    byMonthMap.set(ym, m)

    const yrec = byYearMap.get(y) ?? { year: y, incomeMinor: 0, expenseMinor: 0 }
    yrec.incomeMinor += net
    byYearMap.set(y, yrec)
  }

  for (const exp of expenses) {
    const d = parseISO(exp.dateIso)
    const ym = ymKey(d)
    const y = d.getFullYear()

    totalsAllTime.expenseMinor += exp.amountMinor
    if (ym === nowYm) totalsThisMonth.expenseMinor += exp.amountMinor

    const m = byMonthMap.get(ym) ?? { year: y, month: d.getMonth() + 1, incomeMinor: 0, expenseMinor: 0 }
    m.expenseMinor += exp.amountMinor
    byMonthMap.set(ym, m)

    const yrec = byYearMap.get(y) ?? { year: y, incomeMinor: 0, expenseMinor: 0 }
    yrec.expenseMinor += exp.amountMinor
    byYearMap.set(y, yrec)
  }

  const byMonth = Array.from(byMonthMap.values()).sort((a, b) => a.year - b.year || a.month - b.month)
  const byYear = Array.from(byYearMap.values()).sort((a, b) => a.year - b.year)

  return { totalsAllTime, totalsThisMonth, byMonth, byYear }
}


