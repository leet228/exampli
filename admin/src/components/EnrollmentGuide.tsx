
type Props = {
  width: number
  height: number
  segments: number
  filled: boolean[]
  currentIndex?: number | null
  done?: boolean
}

export default function EnrollmentGuide({ width, height, segments, filled, currentIndex, done }: Props) {
  const pad = 24
  const cx = width / 2
  const cy = height / 2
  const r = Math.max(10, Math.min(cx, cy) - pad)
  const segAngle = (Math.PI * 2) / segments

  function arcPath(i: number) {
    const a0 = -Math.PI / 2 + i * segAngle + segAngle * 0.1
    const a1 = -Math.PI / 2 + (i + 1) * segAngle - segAngle * 0.1
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const large = 0
    const sweep = 1
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* base circle */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={6} />
        {/* segments */}
        {Array.from({ length: segments }).map((_, i) => (
          <path
            key={i}
            d={arcPath(i)}
            stroke={filled[i] ? '#57cc02' : (i === currentIndex ? '#3c73ff' : 'rgba(255,255,255,0.45)')}
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
          />
        ))}
      </svg>
      {done && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', textAlign: 'center', fontWeight: 800, color: '#57cc02', fontSize: 24 }}>
          ✓ Регистрация пройдена
        </div>
      )}
    </div>
  )}


