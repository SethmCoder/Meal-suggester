import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { InventoryPanel } from '../components/InventoryPanel'
import { PhotoInventoryScan } from '../components/PhotoInventoryScan'
import { Badge, EmptyState } from '../components/ui'
import { useSession } from '../context/SessionContext'
import type { Consumption, InventoryItem } from '../data/types'
import { SLOT_LABELS, WEEKDAY_LABELS } from '../data/types'
import { formatQuantity } from '../lib/ingredients'

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function InventoryPage() {
  const { store, persistenceNote } = useSession()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [consumptions, setConsumptions] = useState<Consumption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!store) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [nextItems, nextConsumptions] = await Promise.all([
          store.listInventory(),
          store.listConsumptions(),
        ])
        if (!cancelled) {
          setItems(nextItems)
          setConsumptions(nextConsumptions)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load inventory.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store])

  const finishedTotals = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; unit: string }>()
    for (const entry of consumptions) {
      for (const item of entry.items) {
        const key = `${item.name.toLowerCase()}|${item.unit}`
        const prev = map.get(key)
        if (prev) prev.quantity += item.quantity
        else map.set(key, { name: item.name, quantity: item.quantity, unit: item.unit })
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [consumptions])

  if (!store) return <p className="text-muted">Session unavailable.</p>

  return (
    <div data-tutorial="inventory" className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Food inventory</h1>
          <p className="mt-1 text-sm text-muted">
            Track what you own, scan fridge and pantry photos, or open Expenses to upload a grocery receipt.
            {persistenceNote ? ` ${persistenceNote}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/shopping"
            className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink transition hover:border-primary hover:text-primary"
          >
            Shopping list
          </Link>
          <Link
            to="/app/expenses"
            className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover"
          >
            Expenses & receipts
          </Link>
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading ? <p className="text-sm text-muted">Loading inventory…</p> : null}

      <PhotoInventoryScan
        guided={!loading && items.length === 0}
        onAddItems={async (next) => {
          for (const item of next) {
            await store.upsertInventory(item)
          }
          setItems(await store.listInventory())
        }}
      />

      <InventoryPanel
        items={items}
        onSave={async (item) => {
          await store.upsertInventory(item)
          setItems(await store.listInventory())
        }}
        onDelete={async (id) => {
          await store.deleteInventory(id)
          setItems(await store.listInventory())
        }}
      />

      <section className="soft-shadow rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink">Food finished</h2>
            <p className="mt-1 text-sm text-muted">
              Ingredients deducted when you mark a meal finished on Current Meals.
            </p>
          </div>
          {finishedTotals.length ? (
            <p className="text-sm font-semibold text-ink">
              {finishedTotals.length} ingredient{finishedTotals.length === 1 ? '' : 's'} used
            </p>
          ) : null}
        </div>

        {finishedTotals.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {finishedTotals.map((item) => (
              <Badge key={`${item.name}-${item.unit}`} tone="success">
                {formatQuantity(item.quantity, item.unit)} {item.name}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {!consumptions.length ? (
            <EmptyState
              title="No meals finished yet"
              body="When you finish a planned meal, used ingredients appear here and leave your inventory."
            />
          ) : (
            consumptions.slice(0, 20).map((entry) => (
              <div key={entry.id} className="rounded-xl border border-line bg-canvas/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-ink">{entry.mealName}</p>
                  <Badge tone="neutral">
                    {WEEKDAY_LABELS[entry.day]} {SLOT_LABELS[entry.slot]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">{formatWhen(entry.finishedAt)}</p>
                {entry.note ? <p className="mt-2 text-sm text-muted">{entry.note}</p> : null}
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {entry.items.length ? (
                    entry.items.map((item, index) => (
                      <li key={`${entry.id}-${index}`}>
                        Used {formatQuantity(item.quantity, item.unit)} {item.name}
                        <span className="text-muted/80">
                          {' '}
                          ({formatQuantity(item.inventoryBefore, item.unit)} →{' '}
                          {formatQuantity(item.inventoryAfter, item.unit)})
                        </span>
                      </li>
                    ))
                  ) : entry.note ? null : (
                    <li>No matching inventory was deducted for this meal.</li>
                  )}
                </ul>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
