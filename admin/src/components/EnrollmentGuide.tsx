
type Props = {
  width: number
  height: number
  segments: number
  filled: boolean[]
  currentIndex?: number | null
  done?: boolean
  // нормализованный bbox лица [0..1]
  faceBox?: { minX: number; minY: number; maxX: number; maxY: number } | null
}

export default function EnrollmentGuide({ width, height, segments, filled, currentIndex, done, faceBox }: Props) {
  // центр и радиус — вокруг головы
  let cx = width / 2
  let cy = height / 2
  let r = Math.max(10, Math.min(cx, cy) - 24)
  if (faceBox) {
    const fx = (faceBox.minX + faceBox.maxX) / 2 * width
    const fy = (faceBox.minY + faceBox.maxY) / 2 * height
    const fr = Math.max((faceBox.maxX - faceBox.minX) * width, (faceBox.maxY - faceBox.minY) * height) * 0.65
    cx = fx; cy = fy; r = Math.max(20, fr)
  }
  const segAngle = (Math.PI * 2) / segments

  // Радиальные полосы: от радиуса r к r+len
  const barLen = Math.max(12, Math.min(width, height) * 0.12)

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* base circle */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={6} />
        {/* radial bars */}
        {Array.from({ length: segments }).map((_, i) => {
          const a = -Math.PI / 2 + i * segAngle
          const x0 = cx + r * Math.cos(a)
          const y0 = cy + r * Math.sin(a)
          const x1 = cx + (r + barLen) * Math.cos(a)
          const y1 = cy + (r + barLen) * Math.sin(a)
          const color = filled[i] ? '#57cc02' : (i === currentIndex ? '#3c73ff' : 'rgba(255,255,255,0.45)')
          return (
            <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={color} strokeWidth={6} strokeLinecap="round" />
          )
        })}
      </svg>
      {done && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', textAlign: 'center', fontWeight: 800, color: '#57cc02', fontSize: 24 }}>
          ✓ Регистрация пройдена
        </div>
      )}
    </div>
  )}


