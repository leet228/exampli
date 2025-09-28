import type { MonthlyStat } from '@/lib/types'

interface BarChartProps {
  data: MonthlyStat[]
}

// Simple CSS bar chart for monthly income
export function BarChart({ data }: BarChartProps) {
  const max = Math.max(1, ...data.map(d => d.incomeMinor))
  return (
    <div className="overflow-x-auto">
      <div className="grid grid-flow-col auto-cols-[44px] gap-2 items-end h-40 pr-2">
        {data.map((d) => {
          const h = Math.round((d.incomeMinor / max) * 100)
          const label = `${String(d.month).padStart(2,'0')}.${String(d.year).slice(-2)}`
          return (
            <div key={`${d.year}-${d.month}`} className="flex flex-col items-center gap-1">
              <div className="w-6 rounded bg-blue-500" style={{ height: `${h}%` }} />
              <div className="text-[10px] text-gray-500">{label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


