import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from '@/pages/Dashboard'
import RegistrationPage from '@/pages/Registration'
import IncomePage from '@/pages/Income'
import ReceiptsPage from '@/pages/Receipts'
import ContractsPage from '@/pages/Contracts'
import ExpensesPage from '@/pages/Expenses'
import RegistersPage from '@/pages/Registers'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <header className="border-b bg-white/70 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-6">
            <div className="font-semibold">Бухгалтерия</div>
            <nav className="flex flex-wrap gap-3 text-sm">
              <NavLink to="/" end className={({isActive})=>`px-2 py-1 rounded ${isActive? 'bg-gray-900 text-white':'hover:bg-gray-200'}`}>Дашборд</NavLink>
              <NavLink to="/registration" className={({isActive})=>`px-2 py-1 rounded ${isActive? 'bg-gray-900 text-white':'hover:bg-gray-200'}`}>Регистрация/налоги</NavLink>
              <NavLink to="/income" className={({isActive})=>`px-2 py-1 rounded ${isActive? 'bg-gray-900 text-white':'hover:bg-gray-200'}`}>Доходы</NavLink>
              <NavLink to="/receipts" className={({isActive})=>`px-2 py-1 rounded ${isActive? 'bg-gray-900 text-white':'hover:bg-gray-200'}`}>Чеки</NavLink>
              <NavLink to="/contracts" className={({isActive})=>`px-2 py-1 rounded ${isActive? 'bg-gray-900 text-white':'hover:bg-gray-200'}`}>Договоры</NavLink>
              <NavLink to="/expenses" className={({isActive})=>`px-2 py-1 rounded ${isActive? 'bg-gray-900 text-white':'hover:bg-gray-200'}`}>Расходы</NavLink>
              <NavLink to="/registers" className={({isActive})=>`px-2 py-1 rounded ${isActive? 'bg-gray-900 text-white':'hover:bg-gray-200'}`}>Регистры</NavLink>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/registration" element={<RegistrationPage />} />
            <Route path="/income" element={<IncomePage />} />
            <Route path="/receipts" element={<ReceiptsPage />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/registers" element={<RegistersPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
