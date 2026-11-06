import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AiChat } from '../components/AiChat'
import { MealCellCard, MealDetails } from '../components/MealCellCard'
import { MealEditorModal } from '../components/MealEditorModal'
import { PlanWholeWeek } from '../components/PlanWholeWeek'
import { UseUpFoods } from '../components/UseUpFoods'
import { Button, EmptyState } from '../components/ui'
import { useSession } from '../context/SessionContext'
import type { InventoryItem, Meal, MealCell, MealFeedback, MealSlot, Preferences, Weekday, WeekPlan } from '../data/types'
import { MEAL_SLOTS, SLOT_LABELS, WEEKDAY_LABELS, WEEKDAYS } from '../data/types'
import { consumeMealFromInventory } from '../lib/consume'
import type { MustEatFood } from '../lib/mustEat'
import { suggestMeals } from '../lib/suggest'
import { describeAppliedPattern, inferRecurringCaps, listObservations, recordWeekConstraints } from '../lib/timePatterns'
import { addWeeks, formatDayHeading, formatWeekRange, mondayOf } from '../lib/dates'
import { buildShoppingList } from '../lib/ingredients'
import { downloadMealPlanPdf, emailWeekPlanEnabled, openMealPlanEmail } from '../lib/mealPlanExport'
import { moveMeal } from '../lib/meals'
import type { Suggestion } from '../lib/planner'

export function MealsPage() {
  const { store, profile, persistenceNote } = useSession()
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [week, setWeek] = useState<WeekPlan | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [feedback, setFeedback] = useState<MealFeedback[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [finishingKey, setFinishingKey] = useState<string | null>(null)
  const [useUpBusy, setUseUpBusy] = useState(false)
  const [useUpNote, setUseUpNote] = useState<string | null>(null)
  const [foodProposal, setFoodProposal] = useState<{ reply: string; suggestions: Suggestion[] } | null>(null)
  const [editor, setEditor] = useState<{ day: Weekday; slot: MealSlot; meal: Meal | null } | null>(null)
  const [details, setDetails] = useState<Meal | null>(null)

  const reload = useCallback(async (start: string) => {
    if (!store) return
    setLoading(true)
    setError(null)
    try {
      const [nextWeek, nextInventory, nextPrefs, nextFeedback, lastWeek] = await Promise.all([
        store.getWeek(start),
        store.listInventory(),
        store.getPreferences(),
        store.listFeedback(),
        store.getLastWeekStart(),
      ])
      setWeek(nextWeek)
      setInventory(nextInventory)
      setPreferences(nextPrefs)
      setFeedback(nextFeedback)
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
    if (profile) recordWeekConstraints(profile.id, next)
  }

  async function updateCell(day: Weekday, slot: MealSlot, meal: Meal | null) {
    if (!week) return
    const cells = week.cells.map((cell) =>
      cell.day === day && cell.slot === slot ? { ...cell, meal, finished: false } : cell,
    )
    await saveWeek({ ...week, cells })
  }

  async function finishMeal(day: Weekday, slot: MealSlot) {
    if (!store || !week) return
    const cell = week.cells.find((item) => item.day === day && item.slot === slot)
    if (!cell?.meal || cell.finished) return
    const key = `${day}:${slot}`
    setFinishingKey(key)
    setError(null)
    try {
      const leftover = Boolean(cell.meal.isLeftover)
      const consumed = leftover
        ? { inventory, deducted: [] as ReturnType<typeof consumeMealFromInventory>['deducted'] }
        : consumeMealFromInventory(cell.meal, inventory)
      if (!leftover) {
        await store.replaceInventory(consumed.inventory)
        setInventory(consumed.inventory)
      }
      await store.addConsumption({
        mealName: cell.meal.name,
        day,
        slot,
        weekStart,
        note: leftover ? 'Leftovers from an earlier cook, so inventory was not deducted again.' : undefined,
        items: consumed.deducted.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          inventoryBefore: item.inventoryBefore,
          inventoryAfter: item.inventoryAfter,
        })),
      })
      const cells = week.cells.map((item) =>
        item.day === day && item.slot === slot ? { ...item, finished: true } : item,
      )
      await saveWeek({ ...week, cells })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark meal finished.')
    } finally {
      setFinishingKey(null)
    }
  }

  const recurringCaps = useMemo(
    () => (profile ? inferRecurringCaps(listObservations(profile.id), week) : []),
    [profile, week],
  )
  const patternNote = useMemo(() => (week ? describeAppliedPattern(week.cells) : null), [week])

  function renderMealCell(day: Weekday, slot: MealSlot) {
    if (!week) return null
    const cell = week.cells.find((item) => item.day === day && item.slot === slot) as MealCell
    return (
      <MealCellCard
        key={`${day}-${slot}`}
        cell={cell}
        inventory={inventory}
        finishing={finishingKey === `${day}:${slot}`}
        onAssign={() => setEditor({ day, slot, meal: null })}
        onEdit={() => setEditor({ day, slot, meal: cell.meal })}
        onRemove={() => void updateCell(day, slot, null)}
        onDetails={() => cell.meal && setDetails(cell.meal)}
        onMove={async (to) => {
          const cells = moveMeal(week.cells, { day, slot }, to)
          await saveWeek({ ...week, cells })
        }}
        onFinish={() => void finishMeal(day, slot)}
      />
    )
  }
  const missingIngredients = useMemo(() => {
    if (!week) return 0
    const meals = week.cells.flatMap((cell) => (cell.meal ? [cell.meal] : []))
    return buildShoppingList(meals, inventory, []).filter((row) => row.status !== 'purchased').length
  }, [week, inventory])

  if (!store || !preferences) {
    return <div className="text-muted">{loading ? 'Loading meals…' : 'Session unavailable.'}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Current meals</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Plan Monday–Friday breakfast, lunch, and dinner. {persistenceNote ? persistenceNote : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <p className="min-w-[10.5rem] text-center text-sm font-semibold text-ink">{formatWeekRange(weekStart)}</p>
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
          {week ? (
            <Button type="button" variant="ghost" onClick={() => downloadMealPlanPdf(weekStart, week.cells)}>
              Download PDF
            </Button>
          ) : null}
          {week && profile && emailWeekPlanEnabled(profile.id) ? (
            <Button
              type="button"
              onClick={() => {
                if (!profile.email) {
                  setError('Add an email in Settings before sending the plan.')
                  return
                }
                openMealPlanEmail({ to: profile.email, weekStart, cells: week.cells })
              }}
            >
              Email this week
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {patternNote ? (
        <p className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-ink">{patternNote}</p>
      ) : null}

      {week && preferences ? (
        <UseUpFoods
          inventory={inventory}
          busy={useUpBusy}
          note={useUpNote}
          onPlan={async (foods: MustEatFood[]) => {
            if (!store || !week || !preferences) return
            setUseUpBusy(true)
            setUseUpNote(null)
            setError(null)
            try {
              const names = foods.map((food) => food.name)
              const openSlots = week.cells.filter((cell) => !cell.meal).length
              const result = await suggestMeals({
                message: `I have to eat these foods from the freezer or because they are expiring: ${names.join(', ')}. Plan meals that use them.`,
                inventory,
                preferences,
                week,
                feedback,
                options: { wantWeek: true, emptyOnly: openSlots > 0, mustUse: names, recurringCaps },
              })
              if (!result.suggestions.length) {
                setUseUpNote(result.reply || 'No retrieved recipe used those foods.')
                setFoodProposal(null)
                return
              }
              setFoodProposal({ reply: result.reply, suggestions: result.suggestions })
              setUseUpNote(null)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not plan around those foods.')
            } finally {
              setUseUpBusy(false)
            }
          }}
        />
      ) : null}

      {foodProposal && week ? (
        <section className="soft-shadow rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="text-lg font-bold text-ink">Review these meals</h2>
          <p className="mt-1 text-sm text-muted">{foodProposal.reply}</p>
          <ul className="mt-3 space-y-2">
            {foodProposal.suggestions.map((suggestion) => (
              <li key={`${suggestion.day}:${suggestion.slot}`} className="text-sm text-ink">
                <span className="font-semibold">
                  {WEEKDAY_LABELS[suggestion.day]} {SLOT_LABELS[suggestion.slot]}:
                </span>{' '}
                {suggestion.meal.name}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              disabled={useUpBusy}
              onClick={() => {
                if (!store || !week) return
                void (async () => {
                  setUseUpBusy(true)
                  try {
                    const byCell = new Map(foodProposal.suggestions.map((item) => [`${item.day}:${item.slot}`, item]))
                    const cells = week.cells.map((cell) => {
                      const hit = byCell.get(`${cell.day}:${cell.slot}`)
                      return hit ? { ...cell, meal: hit.meal, finished: false } : cell
                    })
                    await saveWeek({ ...week, cells })
                    for (const suggestion of foodProposal.suggestions) {
                      await store.addFeedback({ mealName: suggestion.meal.name, accepted: true })
                    }
                    setFeedback(await store.listFeedback())
                    setUseUpNote('Added those meals to the week.')
                    setFoodProposal(null)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not add those meals.')
                  } finally {
                    setUseUpBusy(false)
                  }
                })()
              }}
            >
              Apply meals
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFoodProposal(null)
                setUseUpNote('No meals were added.')
              }}
            >
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {week && preferences ? (
        <PlanWholeWeek
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
          onApplyAll={async (suggestions) => {
            const byCell = new Map(suggestions.map((item) => [`${item.day}:${item.slot}`, item]))
            const cells = week.cells.map((cell) => {
              const hit = byCell.get(`${cell.day}:${cell.slot}`)
              return hit ? { ...cell, meal: hit.meal, finished: false } : cell
            })
            await saveWeek({ ...week, cells })
            for (const suggestion of suggestions) {
              await store.addFeedback({ mealName: suggestion.meal.name, accepted: true })
            }
            setFeedback(await store.listFeedback())
          }}
          onEditSuggestion={(suggestion) => {
            setEditor({ day: suggestion.day, slot: suggestion.slot, meal: suggestion.meal })
          }}
          recurringCaps={recurringCaps}
        />
      ) : null}

      {loading || !week ? (
        <EmptyState title="Loading week…" />
      ) : (
        <div data-tutorial="planner">
          <div className="hidden lg:block">
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
                {WEEKDAYS.map((day) => renderMealCell(day, slot))}
              </div>
            ))}
          </div>
          <div className="grid gap-3 lg:hidden">
            {WEEKDAYS.map((day, index) => {
              const heading = formatDayHeading(weekStart, index)
              return (
                <section key={day} className="soft-shadow rounded-2xl border border-line bg-surface p-3">
                  <div className="mb-3 rounded-xl bg-secondary px-3 py-2 text-center text-white">
                    <p className="text-sm font-semibold">{heading.weekday}</p>
                    <p className="text-xs text-white/75">{heading.date}</p>
                  </div>
                  <div className="space-y-2">
                    {MEAL_SLOTS.map((slot) => (
                      <div key={slot}>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{SLOT_LABELS[slot]}</p>
                        {renderMealCell(day, slot)}
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="soft-shadow flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink">Food Inventory</h2>
            <p className="mt-1 text-sm text-muted">
              {inventory.length
                ? `${inventory.length} item${inventory.length === 1 ? '' : 's'} on hand.`
                : 'Nothing on hand yet. Scan your fridge to get started.'}
            </p>
          </div>
          <Link
            to="/app/inventory"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            Open Inventory
          </Link>
        </div>
        <div className="soft-shadow flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink">Shopping List</h2>
            <p className="mt-1 text-sm text-muted">
              {missingIngredients
                ? `${missingIngredients} missing ingredient${missingIngredients === 1 ? '' : 's'} for this week.`
                : 'No missing ingredients for the meals on this week.'}
            </p>
          </div>
          <Link
            to="/app/shopping"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            Open Shopping List
          </Link>
        </div>
      </div>

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
          recurringCaps={recurringCaps}
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
