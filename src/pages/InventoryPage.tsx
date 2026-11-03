import { useEffect, useState } from 'react'
import { InventoryPanel } from '../components/InventoryPanel'
import { PhotoInventoryScan } from '../components/PhotoInventoryScan'
import { useSession } from '../context/SessionContext'
import type { InventoryItem } from '../data/types'

export function InventoryPage() {
  const { store, persistenceNote } = useSession()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!store) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const next = await store.listInventory()
        if (!cancelled) setItems(next)
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

  if (!store) return <p className="text-muted">Session unavailable.</p>

  return (
    <div data-tutorial="inventory" className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Food inventory</h1>
        <p className="mt-1 text-sm text-muted">
          Track what you own, or scan fridge, freezer, cart, and receipt photos to get started fast.
          {persistenceNote ? ` ${persistenceNote}` : ''}
        </p>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading ? <p className="text-sm text-muted">Loading inventory…</p> : null}

      <PhotoInventoryScan
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
    </div>
  )
}
