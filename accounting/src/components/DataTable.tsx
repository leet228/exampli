import type { ReactNode } from 'react'

interface Column<T> {
  key: keyof T | string
  header: string
  render?: (row: T) => ReactNode
}

interface DataTableProps<T> {
  rows: T[]
  columns: Column<T>[]
  getKey: (row: T) => string
}

export function DataTable<T>({ rows, columns, getKey }: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-y-1">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={String(c.key)} className="text-left text-xs font-medium text-gray-500 px-2 py-1">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getKey(row)} className="bg-white">
              {columns.map((c) => (
                <td key={String(c.key)} className="px-2 py-2 text-sm text-gray-800">
                  {c.render ? c.render(row) : String((row as any)[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}


