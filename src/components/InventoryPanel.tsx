import { useMemo, useState, type FormEvent } from 'react'
import type { FoodCategory, InventoryItem } from '../data/types'
import { CATEGORY_LABELS, FOOD_CATEGORIES, UNITS } from '../data/types'
import { createId } from '../lib/id'
import { expiryStatus, todayISO } from '../lib/dates'
import { validateInventoryDraft } from '../lib/validation'
import { Badge, Button, EmptyState, ErrorText, FieldLabel, TextInput, TextSelect } from './ui'

interface InventoryPanelProps {
  items: InventoryItem[]
  onSave: (item: InventoryItem) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const emptyDraft = {
  name: '',
  quantity: '1',
  unit: 'piece',
  expiresOn: '',
  category: 'produce' as FoodCategory,
}

export function InventoryPanel({ items, onSave, onDelete }: InventoryPanelProps) {
  const [draft, setDraft] = useState(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const today = todayISO()

  const grouped = useMemo(() => {
    const map = new Map<FoodCategory, InventoryItem[]>()
    for (const category of FOOD_CATEGORIES) map.set(category, [])
    for (const item of items) {
      const list = map.get(item.category) ?? []
      list.push(item)
      map.set(item.category, list)
    }
    return map
  }, [items])

  function startEdit(item: InventoryItem) {
    setEditingId(item.id)
    setDraft({
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit,
      expiresOn: item.expiresOn ?? '',
      category: item.category,
    })
    setError(null)
  }

  function reset() {
    setEditingId(null)
    setDraft(emptyDraft)
    setError(null)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const validation = validateInventoryDraft(draft)
    if (validation) {
      setError(validation)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave({
        id: editingId ?? createId(),
        name: draft.name.trim(),
        quantity: Number(draft.quantity),
        unit: draft.unit,
        expiresOn: draft.expiresOn || null,
        category: draft.category,
      })
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save item.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="soft-shadow rounded-2xl border border-line bg-surface p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Food inventory</h2>
          <p className="mt-1 text-sm text-muted">Track what you own so the planner and assistant can use it.</p>
        </div>
      </div>

      <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={onSubmit}>
        <div className="sm:col-span-2 lg:col-span-2">
          <FieldLabel htmlFor="inv-name">Food</FieldLabel>
          <TextInput
            id="inv-name"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Spinach"
          />
        </div>
        <div>
          <FieldLabel htmlFor="inv-qty">Qty</FieldLabel>
          <TextInput
            id="inv-qty"
            value={draft.quantity}
            onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
          />
        </div>
        <div>
          <FieldLabel htmlFor="inv-unit">Unit</FieldLabel>
          <TextSelect
            id="inv-unit"
            value={draft.unit}
            onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </TextSelect>
        </div>
        <div>
          <FieldLabel htmlFor="inv-cat">Category</FieldLabel>
          <TextSelect
            id="inv-cat"
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as FoodCategory }))}
          >
            {FOOD_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </TextSelect>
        </div>
        <div className="sm:col-span-2 lg:col-span-2">
          <FieldLabel htmlFor="inv-exp">Expires</FieldLabel>
          <TextInput
            id="inv-exp"
            type="date"
            value={draft.expiresOn}
            onChange={(e) => setDraft((d) => ({ ...d, expiresOn: e.target.value }))}
          />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit" disabled={busy}>
            {editingId ? 'Save changes' : 'Add food'}
          </Button>
          {editingId ? (
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
      <ErrorText>{error}</ErrorText>

      <div className="mt-6 space-y-5">
        {!items.length ? (
          <EmptyState title="Inventory is empty" body="Add produce, pantry staples, and leftovers you already have." />
        ) : (
          FOOD_CATEGORIES.map((category) => {
            const list = grouped.get(category) ?? []
            if (!list.length) return null
            return (
              <div key={category}>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                  {CATEGORY_LABELS[category]}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((item) => {
                    const status = expiryStatus(item.expiresOn, today)
                    return (
                      <div key={item.id} className="rounded-xl border border-line bg-canvas/40 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-ink">{item.name}</p>
                            <p className="text-sm text-muted">
                              {item.quantity} {item.unit}
                            </p>
                          </div>
                          {status === 'expired' ? <Badge tone="danger">Expired</Badge> : null}
                          {status === 'soon' ? <Badge tone="warning">Soon</Badge> : null}
                        </div>
                        {item.expiresOn ? <p className="mt-1 text-xs text-muted">Expires {item.expiresOn}</p> : null}
                        <div className="mt-3 flex gap-2">
                          <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={() => startEdit(item)}>
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="px-3 py-1.5 text-danger"
                            onClick={() => onDelete(item.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
