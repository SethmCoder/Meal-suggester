import { Menu, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Profile, StoreMode } from '../data/types'
import { formatLongDate } from '../lib/dates'
import { AppLogo } from './AppLogo'

export function Header({
  profile,
  mode,
  navOpen,
  onToggleNav,
}: {
  profile: Profile
  mode: StoreMode | null
  navOpen: boolean
  onToggleNav: () => void
}) {
  const initials = profile.username.slice(0, 2).toUpperCase()
  const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date())
  return (
    <header
      data-tutorial="header"
      className="fixed inset-x-0 top-0 z-50 flex h-16 items-center gap-3 border-b border-line bg-canvas/95 px-4 backdrop-blur md:h-20 md:px-6"
    >
      <Link to="/app" className="flex min-w-0 items-center gap-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <AppLogo size={44} />
        <span className="font-display truncate text-2xl font-semibold tracking-tight text-ink md:text-3xl">Planora</span>
      </Link>
      <div className="ml-auto flex items-center gap-2 sm:gap-3 md:gap-4">
        <p className="text-sm text-muted">
          <span className="sm:hidden">{shortDate}</span>
          <span className="hidden sm:inline">{formatLongDate()}</span>
        </p>
        {mode === 'demo' ? (
          <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-ink">Demo</span>
        ) : (
          <span className="max-w-[8rem] truncate rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-ink ring-1 ring-line">
            {profile.username}
          </span>
        )}
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-line" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-white" aria-hidden>
            {initials}
          </div>
        )}
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line text-ink md:hidden"
          onClick={onToggleNav}
          aria-label={navOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
    </header>
  )
}
