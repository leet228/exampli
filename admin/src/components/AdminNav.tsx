type AdminNavProps = {
  active: 'overview' | 'server' | 'db'
}

export default function AdminNav({ active }: AdminNavProps) {
  return (
    <div className="admin-nav">
      <div className="admin-nav__wrap">
        <a href="/admin" className={`admin-tab${active === 'overview' ? ' admin-tab--active' : ''}`} aria-label="Обзор">🏠</a>
        <a href="/admin/server" className={`admin-tab${active === 'server' ? ' admin-tab--active' : ''}`} aria-label="Сервер">🖥️</a>
        <a href="/admin/db" className={`admin-tab${active === 'db' ? ' admin-tab--active' : ''}`} aria-label="База данных">🗄️</a>
      </div>
    </div>
  )
}


