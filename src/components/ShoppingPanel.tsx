import type { InventoryItem } from '../data/types'
import { createId } from '../lib/id'
import { formatQuantity, guessCategory, type ShoppingRow } from '../lib/ingredients'
import { Badge, Button, EmptyState } from './ui'

interface ShoppingPanelProps {
  rows: ShoppingRow[]
  onTogglePurchased: (key: string, purchased: boolean) => Promise<void>
  onAddToInventory: (item: InventoryItem) => Promise<void>
}

export function ShoppingPanel({ rows, onTogglePurchased, onAddToInventory }: ShoppingPanelProps) {
  return (
    <div data-tutorial="shopping" className="soft-shadow rounded-2xl border border-line bg-surface p-4 md:p-5">
      <h2 className="text-lg font-bold text-ink">Shopping list</h2>
      <p className="mt-1 text-sm text-muted">Ingredients missing from this week’s planned meals.</p>

      <div className="mt-4 space-y-2">
        {!rows.length ? (
          <EmptyState title="Nothing to buy" body="Plan meals or clear purchased items to refresh this list." />
        ) : (
          rows.map((row) => (
            <div key={row.key} className="flex flex-col gap-3 rounded-xl border border-line bg-canvas/40 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-ink">{row.name}</p>
                  <Badge
                    tone={row.status === 'purchased' ? 'success' : row.status === 'check' ? 'warning' : 'accent'}
                  >
                    {row.status === 'purchased' ? 'Purchased' : row.status === 'check' ? 'Check amount' : 'Need'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {formatQuantity(row.quantity, row.unit)}
                  {row.mealNames.length ? ` · for ${row.mealNames.join(', ')}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="px-3 py-1.5"
                  onClick={() => onTogglePurchased(row.key, row.status !== 'purchased')}
                >
                  {row.status === 'purchased' ? 'Unmark' : 'Mark purchased'}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="px-3 py-1.5"
                  onClick={() =>
                    onAddToInventory({
                      id: createId(),
                      name: row.name,
                      quantity: row.quantity && row.quantity > 0 ? row.quantity : 1,
                      unit: row.unit || 'piece',
                      expiresOn: null,
                      category: guessCategory(row.name),
                    })
                  }
                >
                  Add to inventory
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
