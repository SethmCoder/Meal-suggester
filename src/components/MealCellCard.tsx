import { ArrowRightLeft, ExternalLink, Pencil, Trash2, UtensilsCrossed } from 'lucide-react'
import type { InventoryItem, Meal, MealCell, MealSlot, Weekday } from '../data/types'
import { MEAL_SLOTS, SLOT_LABELS, WEEKDAY_LABELS, WEEKDAYS } from '../data/types'
import { summarizeStock } from '../lib/ingredients'
import { totalMinutes } from '../lib/meals'
import { Badge, Button } from './ui'

interface MealCellCardProps {
  cell: MealCell
  inventory: InventoryItem[]
  onAssign: () => void
  onEdit: () => void
  onRemove: () => void
  onDetails: () => void
  onMove: (to: { day: Weekday; slot: MealSlot }) => void
}

export function MealCellCard({
  cell,
  inventory,
  onAssign,
  onEdit,
  onRemove,
  onDetails,
  onMove,
}: MealCellCardProps) {
  const meal = cell.meal
  const stock = meal ? summarizeStock(meal.ingredients, inventory) : null
  const minutes = meal ? totalMinutes(meal) : null

  return (
    <div className="soft-shadow flex min-h-[140px] flex-col rounded-2xl border border-line bg-surface p-3">
      {!meal ? (
        <button
          type="button"
          onClick={onAssign}
          className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-line text-sm font-medium text-muted transition hover:border-primary hover:text-primary"
        >
          Add {SLOT_LABELS[cell.slot].toLowerCase()}
        </button>
      ) : (
        <>
          <button type="button" onClick={onDetails} className="flex gap-2.5 text-left">
            <MealThumb meal={meal} size={52} />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 block text-sm font-semibold text-ink">{meal.name}</span>
              <span className="mt-1 line-clamp-2 block text-xs text-muted">
                {meal.ingredients
                  .slice(0, 3)
                  .map((item) => item.name)
                  .join(', ') || 'No ingredients listed'}
                {meal.ingredients.length > 3 ? '…' : ''}
              </span>
            </span>
          </button>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {minutes != null ? <Badge tone="neutral">{minutes} min{meal.timeIsEstimated ? ' est.' : ''}</Badge> : null}
            {stock ? (
              <Badge tone={stock.missingCount ? 'accent' : stock.checkCount ? 'warning' : 'success'}>{stock.label}</Badge>
            ) : null}
            {cell.constraint?.maxMinutes != null ? (
              <Badge tone="primary">≤ {cell.constraint.maxMinutes} min</Badge>
            ) : null}
          </div>
          {meal.sourceUrl ? (
            <a
              href={meal.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {meal.sourceName ? `Recipe · ${meal.sourceName}` : 'Open recipe'}
            </a>
          ) : null}
          <div className="mt-auto flex items-center gap-1 pt-3">
            <Button type="button" variant="ghost" className="px-2 py-1.5" onClick={onEdit} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <label className="relative">
              <span className="sr-only">Move meal</span>
              <select
                className="absolute inset-0 cursor-pointer opacity-0"
                value=""
                onChange={(e) => {
                  const [day, slot] = e.target.value.split(':') as [Weekday, MealSlot]
                  if (day && slot) onMove({ day, slot })
                }}
              >
                <option value="">Move to…</option>
                {WEEKDAYS.flatMap((day) =>
                  MEAL_SLOTS.map((slot) => (
                    <option key={`${day}:${slot}`} value={`${day}:${slot}`} disabled={day === cell.day && slot === cell.slot}>
                      {WEEKDAY_LABELS[day]} {SLOT_LABELS[slot]}
                    </option>
                  )),
                )}
              </select>
              <Button type="button" variant="ghost" className="pointer-events-none px-2 py-1.5" title="Move">
                <ArrowRightLeft className="h-3.5 w-3.5" />
              </Button>
            </label>
            <Button type="button" variant="ghost" className="ml-auto px-2 py-1.5 text-danger" onClick={onRemove} title="Remove">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export function MealThumb({ meal, size = 64 }: { meal: Meal; size?: number }) {
  if (meal.imageUrl) {
    return (
      <img
        src={meal.imageUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-xl object-cover ring-1 ring-line"
        style={{ width: size, height: size }}
        loading="lazy"
      />
    )
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl bg-canvas text-muted ring-1 ring-line"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <UtensilsCrossed className="h-5 w-5" />
    </span>
  )
}

export function MealDetails({ meal, inventory }: { meal: Meal; inventory: InventoryItem[] }) {
  const stock = summarizeStock(meal.ingredients, inventory)
  const minutes = totalMinutes(meal)
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <MealThumb meal={meal} size={96} />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-ink">{meal.name}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {minutes != null ? (
              <Badge>
                {meal.prepMinutes ?? 0} prep / {meal.cookMinutes ?? 0} cook
                {meal.timeIsEstimated ? ' (estimated)' : ''}
              </Badge>
            ) : null}
            <Badge tone={stock.missingCount ? 'accent' : 'success'}>{stock.label}</Badge>
          </div>
          {meal.sourceUrl ? (
            <a
              href={meal.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              <ExternalLink className="h-4 w-4" />
              Open full recipe{meal.sourceName ? ` on ${meal.sourceName}` : ''}
            </a>
          ) : meal.sourceName ? (
            <p className="mt-2 text-sm text-muted">Source: {meal.sourceName} (no public link available)</p>
          ) : null}
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-ink">Ingredients</h4>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {meal.ingredients.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              {item.quantity != null ? `${item.quantity} ` : ''}
              {item.unit ? `${item.unit} ` : ''}
              {item.name}
            </li>
          ))}
          {!meal.ingredients.length ? <li>No ingredients listed.</li> : null}
        </ul>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-ink">Instructions</h4>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          {meal.instructions.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
          {!meal.instructions.length ? <li>No instructions listed.</li> : null}
        </ol>
      </div>
      {meal.sourceRetrieved && !meal.sourcePageFetched && meal.sourceUrl ? (
        <p className="text-xs text-muted">
          Link came from the recipe provider. Planora did not open the publisher page itself.
        </p>
      ) : null}
    </div>
  )
}
