import { DataTable } from '@/components/DataTable'
import { mockRegDocs } from '@/lib/data.mock'

export default function RegistrationPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Документы по регистрации и налогам</h1>
      <DataTable
        rows={mockRegDocs}
        getKey={(r) => r.id}
        columns={[
          { key: 'title', header: 'Название' },
          { key: 'type', header: 'Тип' },
          { key: 'dateIso', header: 'Дата' },
          { key: 'url', header: 'Файл', render: (r) => <a className="text-blue-600" href={r.url} target="_blank" rel="noreferrer">Открыть</a> },
        ]}
      />
    </div>
  )
}


