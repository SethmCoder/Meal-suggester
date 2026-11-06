import type { ReactNode } from 'react'
import { AppLogo } from './AppLogo'

export function AuthCard({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="card-shadow w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center gap-4 border-b border-line bg-canvas px-6 py-6 text-ink">
          <AppLogo size={64} />
          <div>
            <p className="font-display text-4xl font-semibold tracking-tight">Planora</p>
            <p className="text-sm text-muted">Food inventory and meal planning.</p>
          </div>
        </div>
        <div className="px-6 py-6">{children}</div>
        {footer ? <div className="border-t border-line bg-canvas/50 px-6 py-4 text-sm text-muted">{footer}</div> : null}
      </div>
    </div>
  )
}
