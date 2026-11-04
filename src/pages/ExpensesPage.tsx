import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, EmptyState } from '../components/ui'
import { useSession } from '../context/SessionContext'
import type { Purchase } from '../data/types'
import { formatQuantity } from '../lib/ingredients'
import { roundMoney } from '../lib/finance'

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function sourceLabel(source: Purchase['source']) {
  if (source === 'shopping') return 'Shopping list'
  if (source === 'inventory') return 'Inventory'
  return 'Manual'
}

export function ExpensesPage() {
  const { store, persistenceNote } = useSession()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!store) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const next = await store.listPurchases()
        if (!cancelled) setPurchases(next)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load expenses.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store])

  const totalUsd = useMemo(
    () => roundMoney(purchases.reduce((sum, row) => sum + (row.estimatedCostUsd ?? 0), 0)),
    [purchases],
  )

  if (!store) return <p className="text-muted">Session unavailable.</p>

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          <Link to="/app/inventory" className="text-primary hover:underline">
            Food inventory
          </Link>
          <span className="mx-1.5 text-line">/</span>
          Expenses
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Expenses</h1>
        <p className="mt-1 text-sm text-muted">
          Every grocery purchase recorded from your shopping list so far.
          {persistenceNote ? ` ${persistenceNote}` : ''}
        </p>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <section className="soft-shadow rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Purchase history</h2>
            <p className="mt-1 text-sm text-muted">
              {purchases.length
                ? `${purchases.length} purchase${purchases.length === 1 ? '' : 's'} logged`
                : 'No purchases yet'}
            </p>
          </div>
          <p className="text-right">
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted">Est. total</span>
            <span className="text-2xl font-bold text-ink">${totalUsd.toFixed(2)}</span>
          </p>
        </div>

        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="text-sm text-muted">Loading purchases…</p>
          ) : !purchases.length ? (
            <EmptyState
              title="No purchases yet"
              body="Mark items purchased on your shopping list to build this ledger."
            />
          ) : (
            purchases.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-2 rounded-xl border border-line bg-canvas/40 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{row.name}</p>
                    <Badge tone="neutral">{sourceLabel(row.source)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {formatQuantity(row.quantity, row.unit)} · {formatWhen(row.purchasedAt)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-ink">
                  {row.estimatedCostUsd != null ? `$${row.estimatedCostUsd.toFixed(2)}` : '—'}
                </p>
              </div>
            ))
          )}
        </div>

        <p className="mt-4 text-xs text-muted">
          Costs are package-based estimates, not live store prices.{' '}
          <Link to="/app/shopping" className="font-semibold text-primary hover:underline">
            Open shopping list
          </Link>
        </p>
      </section>
    </div>
  )
}
