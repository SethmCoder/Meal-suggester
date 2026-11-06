import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { SessionProvider, useSession } from './context/SessionContext'
import { DemoPage } from './pages/DemoPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { IdealPlanPage } from './pages/IdealPlanPage'
import { InventoryPage } from './pages/InventoryPage'
import { LoginPage } from './pages/LoginPage'
import { MealsPage } from './pages/MealsPage'
import { OnboardingSurveyPage } from './pages/OnboardingSurveyPage'
import { PreferencesPage } from './pages/PreferencesPage'
import { SettingsPage } from './pages/SettingsPage'
import { ShoppingListPage } from './pages/ShoppingListPage'
import { SignupPage } from './pages/SignupPage'

function BootGate({ children }: { children: ReactNode }) {
  const { ready } = useSession()
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-muted">
        Loading Planora…
      </div>
    )
  }
  return children
}

export default function App() {
  return (
    <SessionProvider>
      <BootGate>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/onboarding" element={<OnboardingSurveyPage />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<MealsPage />} />
            <Route path="ideal" element={<IdealPlanPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="shopping" element={<ShoppingListPage />} />
            <Route path="preferences" element={<PreferencesPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BootGate>
    </SessionProvider>
  )
}
