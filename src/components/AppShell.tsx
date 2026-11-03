import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { cn } from '../lib/cn'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { TutorialOverlay } from './TutorialOverlay'

export function AppShell() {
  const { ready, profile, mode, logout } = useSession()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const autoStarted = useRef(false)

  useEffect(() => {
    if (!profile || autoStarted.current) return
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

  return (
    <div className="min-h-screen bg-canvas">
      <Header profile={profile} />
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        onLogout={async () => {
          await logout()
          navigate('/')
        }}
        onStartTutorial={() => setTutorialOpen(true)}
      />
      <main
        className={cn(
          'min-h-screen pt-20 transition-[margin]',
          collapsed ? 'mr-[72px]' : 'mr-60',
        )}
        style={{ ['--sidebar-offset' as string]: collapsed ? '4.5rem' : '15rem' }}
      >
        {mode === 'demo' ? (
          <div className="border-b border-accent/30 bg-accent/15 px-4 py-2 text-center text-sm font-medium text-ink">
            Demo — changes are temporary and will not sync to real accounts.
          </div>
        ) : null}
        <div className="relative p-4 md:p-6">
          <Outlet context={{ openTutorial: () => setTutorialOpen(true) }} />
        </div>
      </main>
      {tutorialOpen ? <TutorialOverlay onClose={() => setTutorialOpen(false)} /> : null}
    </div>
  )
}
