import AdminNav from './components/AdminNav'

export default function Server() {
  return (
    <div className="admin-page">
      <div style={{ padding: 16, paddingBottom: 8, fontSize: 22, fontWeight: 800, letterSpacing: 0.2 }}>Сервер</div>
      <div className="admin-scroll" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' as any }}>
        <div className="admin-fade admin-fade--top" />
        <div style={{ padding: 16, paddingTop: 8, opacity: 0.9 }}>
          Здесь будут: метрики RPS/latency/error rate из Prometheus, алерты и состояние сервисов.
        </div>
        <div className="admin-fade admin-fade--bottom" />
      </div>
      <AdminNav active="server" />
    </div>
  )
}


