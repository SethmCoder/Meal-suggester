import type { InventoryItem } from '../data/types'
import { createId } from '../lib/id'
import { formatQuantity, guessCategory, type ShoppingRow } from '../lib/ingredients'
import type { IngredientPrice } from '../lib/openPrices'
import { Badge, Button, EmptyState } from './ui'

interface ShoppingPanelProps {
  rows: ShoppingRow[]
  prices?: Record<string, IngredientPrice | undefined>
  onTogglePurchased: (key: string, purchased: boolean) => Promise<void>
  onAddToInventory: (item: InventoryItem) => Promise<void>
  plannedMeals?: number
}

export function ShoppingPanel({ rows, prices, onTogglePurchased, onAddToInventory, plannedMeals = 0 }: ShoppingPanelProps) {
  return (
    <div data-tutorial="shopping" className="soft-shadow rounded-2xl border border-line bg-surface p-4 md:p-5">
      <h2 className="text-lg font-bold text-ink">What to buy</h2>
      <p className="mt-1 text-sm text-muted">Ingredients still missing after subtracting your inventory.</p>

      <div className="mt-4 space-y-2">
        {!rows.length ? (
          <EmptyState
            title="Nothing to buy"
            body={
              plannedMeals > 0
                ? 'Planned meals are covered by food you can still use.'
                : 'Plan meals to build this list.'
            }
          />
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
                <PriceTag price={prices?.[row.key]} />
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

function PriceTag({ price }: { price?: IngredientPrice }) {
  if (!price || price.averageUsd == null) return null
  const where = price.scope === 'nearby' ? 'nearby stores' : 'US community prices'
  return (
    <p className="mt-1 text-sm font-semibold text-primary">
      ${price.averageUsd.toFixed(2)} avg
      <span className="ml-1 font-normal text-muted">
        · {price.sampleCount} price{price.sampleCount === 1 ? '' : 's'} from {where}
        {price.exampleProduct ? ` · e.g. ${price.exampleProduct}` : ''}
      </span>
    </p>
  )
}
