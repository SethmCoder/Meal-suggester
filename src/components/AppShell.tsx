import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { cn } from '../lib/cn'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { TutorialOverlay } from './TutorialOverlay'

export function AppShell() {
  const { ready, profile, mode, logout } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const autoStarted = useRef(false)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const apply = () => {
      if (media.matches) setMobileOpen(false)
    }
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!profile || autoStarted.current) return
    if (!profile.surveyCompleted) return
    if (profile.autoStartTutorial && !profile.tutorialCompleted) {
      autoStarted.current = true
      setTutorialOpen(true)
    }
  }, [profile])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-muted">
        Loading Planora…
      </div>
    )
  }

  if (!profile) return <Navigate to="/" replace />
  if (!profile.surveyCompleted) return <Navigate to="/onboarding" replace />

  return (
    <div className="min-h-screen bg-canvas">
      <Header
        profile={profile}
        mode={mode}
        navOpen={mobileOpen}
        onToggleNav={() => setMobileOpen((open) => !open)}
      />
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-ink/40 md:hidden"
          aria-label="Close sidebar"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggle={() => {
          if (window.matchMedia('(max-width: 767px)').matches) {
            setMobileOpen(false)
            return
          }
          setCollapsed((value) => !value)
        }}
        onNavigate={() => setMobileOpen(false)}
        onLogout={async () => {
          await logout()
          navigate('/')
        }}
        onStartTutorial={() => setTutorialOpen(true)}
      />
      <main
        className={cn(
          'min-h-screen pt-16 transition-[margin] max-md:mr-0 md:pt-20',
          collapsed ? 'main-collapsed' : 'main-expanded',
        )}
      >
        {mode === 'demo' ? (
          <div className="border-b border-accent/30 bg-accent/15 px-4 py-2 text-center text-sm font-medium text-ink">
            Demo — changes are temporary and will not sync to real accounts.
          </div>
        ) : null}
        <div className="relative mx-auto w-full max-w-7xl p-4 pb-28 md:p-6 md:pb-28">
          <Outlet context={{ openTutorial: () => setTutorialOpen(true) }} />
        </div>
      </main>
      {tutorialOpen ? <TutorialOverlay onClose={() => setTutorialOpen(false)} /> : null}
    </div>
  )
}
