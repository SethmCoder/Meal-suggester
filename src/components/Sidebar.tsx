import {
  BookOpen,
  ChefHat,
  ChevronsRight,
  LogOut,
  Receipt,
  Refrigerator,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../lib/cn'
import { AppLogo } from './AppLogo'

interface SidebarProps {
  collapsed: boolean
  mobileOpen: boolean
  onToggle: () => void
  onNavigate: () => void
  onLogout: () => void
  onStartTutorial: () => void
}

function ItemLabel({ collapsed, children }: { collapsed: boolean; children: string }) {
  return <span className={cn(collapsed && 'md:hidden')}>{children}</span>
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
    isActive ? 'bg-primary text-white' : 'text-white/80 hover:bg-white/10 hover:text-white',
  )

export function Sidebar({
  collapsed,
  mobileOpen,
  onToggle,
  onNavigate,
  onLogout,
  onStartTutorial,
}: SidebarProps) {
  return (
    <aside
      data-tutorial="sidebar"
      className={cn(
        'sidebar-rail fixed bottom-0 right-0 top-16 z-40 flex w-64 flex-col border-l border-white/10 bg-secondary text-white transition-[transform,width] md:top-20',
        collapsed && 'is-collapsed',
        mobileOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0',
      )}
    >
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {collapsed ? (
          <div className="mb-2 hidden justify-center py-1 md:flex">
            <AppLogo size={40} />
          </div>
        ) : null}
        <NavLink to="/app" end className={linkClass} title="Current Meals" onClick={onNavigate}>
          <ChefHat className="h-5 w-5 shrink-0" />
          <ItemLabel collapsed={collapsed}>Current Meals</ItemLabel>
        </NavLink>
        <NavLink to="/app/inventory" className={linkClass} title="Food Inventory" onClick={onNavigate}>
          <Refrigerator className="h-5 w-5 shrink-0" />
          <ItemLabel collapsed={collapsed}>Food Inventory</ItemLabel>
        </NavLink>
        <NavLink to="/app/shopping" className={linkClass} title="Shopping List" onClick={onNavigate}>
          <ShoppingCart className="h-5 w-5 shrink-0" />
          <ItemLabel collapsed={collapsed}>Shopping List</ItemLabel>
        </NavLink>
        <NavLink to="/app/expenses" className={linkClass} title="Expenses" onClick={onNavigate}>
          <Receipt className="h-5 w-5 shrink-0" />
          <ItemLabel collapsed={collapsed}>Expenses</ItemLabel>
        </NavLink>
        <NavLink to="/app/preferences" className={linkClass} title="Food Preferences" onClick={onNavigate}>
          <SlidersHorizontal className="h-5 w-5 shrink-0" />
          <ItemLabel collapsed={collapsed}>Food Preferences</ItemLabel>
        </NavLink>
        <button
          type="button"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          onClick={() => {
            onNavigate()
            onStartTutorial()
          }}
          title="Tutorial"
        >
          <BookOpen className="h-5 w-5 shrink-0" />
          <ItemLabel collapsed={collapsed}>Tutorial</ItemLabel>
        </button>
        <NavLink to="/app/settings" className={linkClass} title="Settings" onClick={onNavigate}>
          <Settings className="h-5 w-5 shrink-0" />
          <ItemLabel collapsed={collapsed}>Settings</ItemLabel>
        </NavLink>
        <button
          type="button"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          onClick={onLogout}
          title="Log Out"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <ItemLabel collapsed={collapsed}>Log Out</ItemLabel>
        </button>
      </nav>
      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-white/85 transition hover:bg-white/10"
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-label={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          <ChevronsRight className={cn('h-5 w-5 shrink-0 transition', collapsed && 'md:rotate-180')} />
          <span className="md:hidden">Collapse Sidebar</span>
          {!collapsed ? <span className="hidden md:inline">Collapse Sidebar</span> : null}
        </button>
      </div>
    </aside>
  )
}
