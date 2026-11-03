import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AiChat } from '../components/AiChat'
import { MealCellCard, MealDetails } from '../components/MealCellCard'
import { MealEditorModal } from '../components/MealEditorModal'
import { ShoppingPanel } from '../components/ShoppingPanel'
import { Button, EmptyState } from '../components/ui'
import { useSession } from '../context/SessionContext'
import type { InventoryItem, Meal, MealCell, MealFeedback, MealSlot, Preferences, Weekday, WeekPlan } from '../data/types'
import { MEAL_SLOTS, SLOT_LABELS, WEEKDAYS } from '../data/types'
import { addWeeks, formatDayHeading, formatWeekRange, mondayOf } from '../lib/dates'
import { buildShoppingList } from '../lib/ingredients'
import { moveMeal } from '../lib/meals'
import type { Suggestion } from '../lib/planner'

export function MealsPage() {
  const { store, profile, persistenceNote } = useSession()
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [week, setWeek] = useState<WeekPlan | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [feedback, setFeedback] = useState<MealFeedback[]>([])
  const [purchased, setPurchased] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ day: Weekday; slot: MealSlot; meal: Meal | null } | null>(null)
  const [details, setDetails] = useState<Meal | null>(null)

  const reload = useCallback(async (start: string) => {
    if (!store) return
    setLoading(true)
    setError(null)
    try {
      const [nextWeek, nextInventory, nextPrefs, nextFeedback, nextPurchased, lastWeek] = await Promise.all([
        store.getWeek(start),
        store.listInventory(),
        store.getPreferences(),
        store.listFeedback(),
        store.listPurchased(start),
        store.getLastWeekStart(),
      ])
      setWeek(nextWeek)
      setInventory(nextInventory)
      setPreferences(nextPrefs)
      setFeedback(nextFeedback)
      setPurchased(nextPurchased)
      if (profile?.openOnCurrentWeek === false && lastWeek && start === mondayOf(new Date()) && lastWeek !== start) {
        // Keep requested week; only seed last week tracking on first open via effect below.
      }
      await store.setLastWeekStart(start)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this week.')
    } finally {
      setLoading(false)
    }
  }, [store, profile])

  useEffect(() => {
    if (!store || !profile) return
    let cancelled = false
    ;(async () => {
      const current = mondayOf(new Date())
      let start = current
      if (!profile.openOnCurrentWeek) {
        const last = await store.getLastWeekStart()
        if (last) start = last
      }
      if (!cancelled) {
        setWeekStart(start)
        await reload(start)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store, profile, reload])

  async function saveWeek(next: WeekPlan) {
    if (!store) return
    setWeek(next)
    await store.saveWeek(next)
  }

  async function updateCell(day: Weekday, slot: MealSlot, meal: Meal | null) {
    if (!week) return
    const cells = week.cells.map((cell) => (cell.day === day && cell.slot === slot ? { ...cell, meal } : cell))
    await saveWeek({ ...week, cells })
  }

  const shoppingRows = useMemo(() => {
    if (!week) return []
    const meals = week.cells.filter((cell) => cell.meal).map((cell) => cell.meal!) 
    return buildShoppingList(meals, inventory, purchased)
  }, [week, inventory, purchased])

  if (!store || !preferences) {
    return <div className="text-muted">{loading ? 'Loading meals…' : 'Session unavailable.'}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Current meals</h1>
          <p className="mt-1 text-sm text-muted">
            Plan Monday–Friday. {persistenceNote ? persistenceNote : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="px-3"
            onClick={() => {
              const next = addWeeks(weekStart, -1)
              setWeekStart(next)
              void reload(next)
            }}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-[180px] text-center text-sm font-semibold text-ink">{formatWeekRange(weekStart)}</p>
          <Button
            type="button"
            variant="ghost"
            className="px-3"
            onClick={() => {
              const next = addWeeks(weekStart, 1)
              setWeekStart(next)
              void reload(next)
            }}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading || !week ? (
        <EmptyState title="Loading week…" />
      ) : (
        <div data-tutorial="planner" className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="mb-2 grid grid-cols-[110px_repeat(5,minmax(0,1fr))] gap-2">
              <div />
              {WEEKDAYS.map((day, index) => {
                const heading = formatDayHeading(weekStart, index)
                return (
                  <div key={day} className="rounded-xl bg-secondary px-3 py-2 text-center text-white">
                    <p className="text-sm font-semibold">{heading.weekday}</p>
                    <p className="text-xs text-white/75">{heading.date}</p>
                  </div>
                )
              })}
            </div>
            {MEAL_SLOTS.map((slot) => (
              <div key={slot} className="mb-2 grid grid-cols-[110px_repeat(5,minmax(0,1fr))] gap-2">
                <div className="flex items-center rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink">
                  {SLOT_LABELS[slot]}
                </div>
                {WEEKDAYS.map((day) => {
                  const cell = week.cells.find((item) => item.day === day && item.slot === slot) as MealCell
                  return (
                    <MealCellCard
                      key={`${day}-${slot}`}
                      cell={cell}
                      inventory={inventory}
                      onAssign={() => setEditor({ day, slot, meal: null })}
                      onEdit={() => setEditor({ day, slot, meal: cell.meal })}
                      onRemove={() => void updateCell(day, slot, null)}
                      onDetails={() => cell.meal && setDetails(cell.meal)}
                      onMove={async (to) => {
                        const cells = moveMeal(week.cells, { day, slot }, to)
                        await saveWeek({ ...week, cells })
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="soft-shadow flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Food inventory</h2>
          <p className="mt-1 text-sm text-muted">
            {inventory.length
              ? `${inventory.length} item${inventory.length === 1 ? '' : 's'} on hand. Scan fridge photos or edit stock on the inventory tab.`
              : 'Inventory is empty. Scan your fridge and freezer to seed what you already own.'}
          </p>
        </div>
        <Link
          to="/app/inventory"
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          Open Food Inventory
        </Link>
      </div>

      <ShoppingPanel
        rows={shoppingRows}
        onTogglePurchased={async (key, purchasedFlag) => {
          await store.setPurchased(weekStart, key, purchasedFlag)
          setPurchased(await store.listPurchased(weekStart))
        }}
        onAddToInventory={async (item) => {
          await store.upsertInventory(item)
          setInventory(await store.listInventory())
        }}
      />

      {week && preferences ? (
        <AiChat
          inventory={inventory}
          preferences={preferences}
          week={week}
          feedback={feedback}
          onApplyConstraints={async (constraints) => {
            const cells = week.cells.map((cell) => {
              const next = constraints.find((item) => item.day === cell.day && item.slot === cell.slot)
              return next ? { ...cell, constraint: next.constraint } : cell
            })
            await saveWeek({ ...week, cells })
          }}
          onAccept={async (suggestion: Suggestion) => {
            await updateCell(suggestion.day, suggestion.slot, suggestion.meal)
            await store.addFeedback({ mealName: suggestion.meal.name, accepted: true })
            setFeedback(await store.listFeedback())
          }}
          onReject={async (suggestion: Suggestion) => {
            await store.addFeedback({ mealName: suggestion.meal.name, accepted: false })
            setFeedback(await store.listFeedback())
          }}
          onEditSuggestion={(suggestion) => {
            setEditor({ day: suggestion.day, slot: suggestion.slot, meal: suggestion.meal })
          }}
        />
      ) : null}

      {editor ? (
        <MealEditorModal
          title={editor.meal ? 'Edit meal' : 'Assign meal'}
          initial={editor.meal}
          onClose={() => setEditor(null)}
          onSave={async (meal) => {
            await updateCell(editor.day, editor.slot, meal)
          }}
        />
      ) : null}

      {details ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="card-shadow max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5">
            <MealDetails meal={details} inventory={inventory} />
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="ghost" onClick={() => setDetails(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
