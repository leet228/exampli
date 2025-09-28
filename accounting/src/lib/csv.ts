function toCsvValue(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function toCsv(rows: Record<string, unknown>[], headers?: string[]): string {
  if (!rows?.length) return ''
  const cols = headers && headers.length ? headers : Object.keys(rows[0])
  const lines = [cols.join(',')]
  for (const r of rows) {
    lines.push(cols.map(c => toCsvValue((r as any)[c])).join(','))
  }
  return lines.join('\n')
}


