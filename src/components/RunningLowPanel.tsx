import type { InventoryItem } from '../data/types'
import { createId } from '../lib/id'
import { formatQuantity, guessCategory } from '../lib/ingredients'
import type { RunningLowItem } from '../lib/runningLow'
import { Badge, Button, EmptyState } from './ui'

interface RunningLowPanelProps {
  items: RunningLowItem[]
  busy?: boolean
  message?: string | null
  onRefresh: () => void
  onDismiss: (key: string) => void
  onMarkPurchased: (key: string) => void
  onAddToInventory: (item: InventoryItem) => Promise<void>
}

export function RunningLowPanel({
  items,
  busy,
  message,
  onRefresh,
  onDismiss,
  onMarkPurchased,
  onAddToInventory,
}: RunningLowPanelProps) {
  return (
    <div className="soft-shadow rounded-2xl border border-line bg-surface p-4 md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Running low</h2>
          <p className="mt-1 text-sm text-muted">
            Common staples (soy sauce, oil, garlic, and similar) that look depleted based on inventory and this week’s
            meals. The assistant can refresh this list.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={onRefresh} disabled={busy} className="shrink-0">
          {busy ? 'Checking…' : 'Refresh with AI'}
        </Button>
      </div>
      {message ? <p className="mt-3 text-sm text-ink">{message}</p> : null}

      <div className="mt-4 space-y-2">
        {!items.length ? (
          <EmptyState
            title="No running-low staples"
            body="Refresh with AI after planning meals, or add low pantry items to inventory."
          />
        ) : (
          items.map((item) => (
            <div
              key={item.key}
              className="flex flex-col gap-3 rounded-xl border border-line bg-canvas/40 p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-ink">{item.name}</p>
                  <Badge tone="warning">Running low</Badge>
                  <Badge tone={item.source === 'ai' ? 'primary' : 'neutral'}>
                    {item.source === 'ai' ? 'AI' : 'Detected'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {item.reason}
                  {item.quantity != null ? ` · ${formatQuantity(item.quantity, item.unit)}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={() => onMarkPurchased(item.key)}>
                  Mark purchased
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="px-3 py-1.5"
                  onClick={() =>
                    void onAddToInventory({
                      id: createId(),
                      name: item.name,
                      quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
                      unit: item.unit || 'piece',
                      expiresOn: null,
                      category: guessCategory(item.name),
                    })
                  }
                >
                  Add to inventory
                </Button>
                <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={() => onDismiss(item.key)}>
                  Dismiss
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
