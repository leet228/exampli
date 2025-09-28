import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from '@/pages/Dashboard'
import { BottomNav } from '@/components/BottomNav'
import RegistrationPage from '@/pages/Registration'
import IncomePage from '@/pages/Income'
import ReceiptsPage from '@/pages/Receipts'
import ContractsPage from '@/pages/Contracts'
import ExpensesPage from '@/pages/Expenses'
import RegistersPage from '@/pages/Registers'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 text-gray-900 pb-16">
        <header className="border-b bg-white/70 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-6">
            <div className="font-semibold">Бухгалтерия</div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">
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
        <BottomNav />
      </div>
    </BrowserRouter>
  )
}

export default App
