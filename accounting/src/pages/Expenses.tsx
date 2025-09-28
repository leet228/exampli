import { DataTable } from '@/components/DataTable'
import { formatMoneyFromMinor } from '@/lib/format'
import { mockExpenses } from '@/lib/data.mock'

export default function ExpensesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Учет расходов</h1>
      <DataTable
        rows={mockExpenses}
        getKey={(r) => r.id}
        columns={[
          { key: 'dateIso', header: 'Дата' },
          { key: 'counterparty', header: 'Контрагент' },
          { key: 'category', header: 'Категория' },
          { key: 'amountMinor', header: 'Сумма', render: (r) => formatMoneyFromMinor(r.amountMinor, r.currency) },
          { key: 'documentRef', header: 'Документ' },
        ]}
      />
    </div>
  )
}


