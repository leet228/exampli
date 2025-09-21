export default function Server() {
  return (
    <div style={{ minHeight: '100dvh', background: '#000', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 16, fontSize: 24, fontWeight: 700 }}>Сервер</div>
      <div style={{ flex: 1, padding: 16, opacity: 0.8 }}>
        Здесь будут: метрики RPS/latency/error rate из Prometheus, алерты и состояние сервисов.
      </div>
      <div style={{ borderTop: '1px solid #222', padding: 8, display: 'flex', gap: 8 }}>
        <a href="/admin" style={{ flex: 1, textDecoration: 'none', color: '#000', background: '#fff', border: '1px solid #222', borderRadius: 10, padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>Обзор</a>
        <a href="/admin/server" style={{ flex: 1, textDecoration: 'none', color: '#fff', background: '#111', border: '1px solid #222', borderRadius: 10, padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>Сервер</a>
      </div>
    </div>
  )
}


