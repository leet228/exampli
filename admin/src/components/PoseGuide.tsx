type Props = {
  direction: 'left' | 'right' | 'up' | 'down' | 'center'
  progress: number // 0..1
}

export default function PoseGuide({ direction, progress }: Props) {
  const arrow = direction === 'left' ? '←'
    : direction === 'right' ? '→'
    : direction === 'up' ? '↑'
    : direction === 'down' ? '↓'
    : '●'
  const text = direction === 'center' ? 'Держи лицо в центре'
    : direction === 'left' ? 'Медленно поверни голову влево'
    : direction === 'right' ? 'Медленно поверни голову вправо'
    : direction === 'up' ? 'Слегка подними голову'
    : 'Слегка опусти голову'

  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)))

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ height: 24 }} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, lineHeight: 1, color: '#ffd166', textShadow: '0 2px 10px rgba(0,0,0,0.35)' }}>{arrow}</div>
        <div style={{ marginTop: 8, fontWeight: 800, color: '#ffd166', textShadow: '0 2px 10px rgba(0,0,0,0.35)' }}>{text}</div>
      </div>
      <div style={{ width: '90%', marginBottom: 14 }}>
        <div style={{ height: 10, background: 'rgba(255,255,255,0.2)', borderRadius: 9999, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#57cc02' }} />
        </div>
        <div style={{ marginTop: 6, textAlign: 'right', fontWeight: 700, color: '#57cc02' }}>{pct}%</div>
      </div>
    </div>
  )
}


