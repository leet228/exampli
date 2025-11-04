type AdminNavProps = {
  active: 'overview' | 'server' | 'db' | 'revenue' | 'bot'
}

export default function AdminNav({ active }: AdminNavProps) {
  return (
    <div className="admin-nav">
      <div className="admin-nav__wrap">
        <a href="/admin" className={`admin-tab${active === 'overview' ? ' admin-tab--active' : ''}`} aria-label="Обзор">🏠</a>
        <a href="/admin/server" className={`admin-tab${active === 'server' ? ' admin-tab--active' : ''}`} aria-label="Сервер">🖥️</a>
        <a href="/admin/db" className={`admin-tab${active === 'db' ? ' admin-tab--active' : ''}`} aria-label="База данных">🗄️</a>
        <a href="/admin/revenue" className={`admin-tab${active === 'revenue' ? ' admin-tab--active' : ''}`} aria-label="Доходы">💰</a>
        <a href="/admin/bot" className={`admin-tab${active === 'bot' ? ' admin-tab--active' : ''}`} aria-label="Бот">🤖</a>
      </div>
    </div>
  )
}


