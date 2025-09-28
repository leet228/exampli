import { toCsv } from '@/lib/csv'

interface ExportButtonsProps {
  fileBase: string
  rawRows: Record<string, unknown>[]
  monthly?: Record<string, unknown>[]
  yearly?: Record<string, unknown>[]
}

export function ExportButtons({ fileBase, rawRows, monthly = [], yearly = [] }: ExportButtonsProps) {
  function download(name: string, content: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button className="px-3 py-2 rounded bg-gray-900 text-white text-sm" onClick={() => download(`${fileBase}-raw.csv`, toCsv(rawRows))}>CSV все платежи</button>
      {monthly.length > 0 && (
        <button className="px-3 py-2 rounded bg-blue-600 text-white text-sm" onClick={() => download(`${fileBase}-by-month.csv`, toCsv(monthly))}>CSV по месяцам</button>
      )}
      {yearly.length > 0 && (
        <button className="px-3 py-2 rounded bg-blue-600 text-white text-sm" onClick={() => download(`${fileBase}-by-year.csv`, toCsv(yearly))}>CSV по годам</button>
      )}
    </div>
  )
}


