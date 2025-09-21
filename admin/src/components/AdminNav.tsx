type AdminNavProps = {
  active: 'overview' | 'server' | 'db'
}

export default function AdminNav({ active }: AdminNavProps) {
  return (
    <div className="admin-nav">
      <div className="admin-nav__wrap">
        <a href="/admin" className={`admin-tab${active === 'overview' ? ' admin-tab--active' : ''}`}>Обзор</a>
        <a href="/admin/server" className={`admin-tab${active === 'server' ? ' admin-tab--active' : ''}`}>Сервер</a>
        <a href="/admin/db" className={`admin-tab${active === 'db' ? ' admin-tab--active' : ''}`}>База</a>
      </div>
    </div>
  )
}


