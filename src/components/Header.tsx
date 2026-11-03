import { Link } from 'react-router-dom'
import type { Profile } from '../data/types'
import { formatLongDate } from '../lib/dates'
import { AppLogo } from './AppLogo'

export function Header({ profile }: { profile: Profile }) {
  const initials = profile.username.slice(0, 2).toUpperCase()
  return (
    <header
      data-tutorial="header"
      className="fixed inset-x-0 top-0 z-40 flex h-20 items-center gap-3 border-b border-line bg-white px-4 md:px-6"
    >
      <Link to="/app" className="flex items-center gap-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <AppLogo size={76} />
        <span className="text-2xl font-bold tracking-tight text-ink">Planora</span>
      </Link>
      <div className="ml-auto flex items-center gap-3 md:gap-4">
        <p className="hidden text-sm text-muted sm:block">{formatLongDate()}</p>
        <p className="text-sm font-medium text-ink">{profile.username}</p>
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-line" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            {initials}
          </div>
        )}
      </div>
    </header>
  )
}
