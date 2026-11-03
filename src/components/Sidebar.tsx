import {
  BookOpen,
  ChefHat,
  ChevronsLeft,
  LogOut,
  Refrigerator,
  Settings,
  SlidersHorizontal,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../lib/cn'
import { AppLogo } from './AppLogo'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onLogout: () => void
  onStartTutorial: () => void
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
    isActive ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white',
  )

export function Sidebar({ collapsed, onToggle, onLogout, onStartTutorial }: SidebarProps) {
  return (
    <aside
      data-tutorial="sidebar"
      className={cn(
        'fixed bottom-0 right-0 top-20 z-30 flex flex-col border-l border-secondary/40 bg-secondary text-white transition-[width]',
        collapsed ? 'w-[72px]' : 'w-60',
      )}
    >
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {!collapsed ? null : (
          <div className="mb-2 flex justify-center py-1">
            <AppLogo size={52} />
          </div>
        )}
        <NavLink to="/app" end className={linkClass} title="Current Meals">
          <ChefHat className="h-5 w-5 shrink-0" />
          {!collapsed ? <span>Current Meals</span> : null}
        </NavLink>
        <NavLink to="/app/inventory" className={linkClass} title="Food Inventory">
          <Refrigerator className="h-5 w-5 shrink-0" />
          {!collapsed ? <span>Food Inventory</span> : null}
        </NavLink>
        <NavLink to="/app/preferences" className={linkClass} title="Food Preferences">
          <SlidersHorizontal className="h-5 w-5 shrink-0" />
          {!collapsed ? <span>Food Preferences</span> : null}
        </NavLink>
        <button
          type="button"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          onClick={onStartTutorial}
          title="Tutorial"
        >
          <BookOpen className="h-5 w-5 shrink-0" />
          {!collapsed ? <span>Tutorial</span> : null}
        </button>
        <NavLink to="/app/settings" className={linkClass} title="Settings">
          <Settings className="h-5 w-5 shrink-0" />
          {!collapsed ? <span>Settings</span> : null}
        </NavLink>
        <button
          type="button"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          onClick={onLogout}
          title="Log Out"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed ? <span>Log Out</span> : null}
        </button>
      </nav>
      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-white/85 transition hover:bg-white/10"
          title="Collapse Sidebar"
          aria-label="Collapse Sidebar"
        >
          <ChevronsLeft className={cn('h-5 w-5 transition', collapsed && 'rotate-180')} />
          {!collapsed ? <span>Collapse Sidebar</span> : null}
        </button>
      </div>
    </aside>
  )
}
