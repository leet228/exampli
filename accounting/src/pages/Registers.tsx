import { DataTable } from '@/components/DataTable'
import type { LedgerEntry } from '@/lib/types'

const mockLedger: LedgerEntry[] = [
  { id: 'l1', dateIso: '2025-01-10', description: 'Подписка u1', debitMinor: 0, creditMinor: 49601 },
  { id: 'l2', dateIso: '2025-01-31', description: 'Маркетинг', debitMinor: 250000, creditMinor: 0 },
]

export default function RegistersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Бухгалтерские регистры</h1>
      <h2 className="text-base font-medium">Книга доходов/расходов</h2>
      <DataTable
        rows={mockLedger}
        getKey={(r) => r.id}
        columns={[
          { key: 'dateIso', header: 'Дата' },
          { key: 'description', header: 'Описание' },
          { key: 'debitMinor', header: 'Дебет (мин. ед.)' },
          { key: 'creditMinor', header: 'Кредит (мин. ед.)' },
        ]}
      />
    </div>
  )
}


