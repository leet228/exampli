import { NavLink } from 'react-router-dom'

const linkCls = (isActive: boolean) => `flex flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'text-blue-600' : 'text-gray-500'}`

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto max-w-6xl grid grid-cols-6 py-2">
        <NavLink to="/" end className={({isActive}) => linkCls(isActive)}>Дашборд</NavLink>
        <NavLink to="/registration" className={({isActive}) => linkCls(isActive)}>Регистрация</NavLink>
        <NavLink to="/income" className={({isActive}) => linkCls(isActive)}>Доходы</NavLink>
        <NavLink to="/receipts" className={({isActive}) => linkCls(isActive)}>Чеки</NavLink>
        <NavLink to="/contracts" className={({isActive}) => linkCls(isActive)}>Договоры</NavLink>
        <NavLink to="/registers" className={({isActive}) => linkCls(isActive)}>Регистры</NavLink>
      </div>
    </nav>
  )
}


