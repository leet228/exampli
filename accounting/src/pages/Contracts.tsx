import { DataTable } from '@/components/DataTable'
import { mockContracts } from '@/lib/data.mock'

export default function ContractsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Договоры и оферты</h1>
      <DataTable
        rows={mockContracts}
        getKey={(r) => r.id}
        columns={[
          { key: 'title', header: 'Название' },
          { key: 'version', header: 'Версия' },
          { key: 'dateIso', header: 'Дата' },
          { key: 'url', header: 'Ссылка', render: (r) => <a className="text-blue-600" href={r.url} target="_blank" rel="noreferrer">Открыть</a> },
        ]}
      />
    </div>
  )
}


