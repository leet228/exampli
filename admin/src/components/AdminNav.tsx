type AdminNavProps = {
  active: 'overview' | 'server'
}

export default function AdminNav({ active }: AdminNavProps) {
  return (
    <div className="admin-nav">
      <div className="admin-nav__wrap">
        <a href="/admin" className={`admin-tab${active === 'overview' ? ' admin-tab--active' : ''}`}>Обзор</a>
        <a href="/admin/server" className={`admin-tab${active === 'server' ? ' admin-tab--active' : ''}`}>Сервер</a>
      </div>
    </div>
  )
}


