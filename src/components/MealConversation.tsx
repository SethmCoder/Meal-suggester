import { useEffect, useRef, useState } from 'react'
import type { InventoryItem, Meal, MealFeedback, MealSlot, Preferences, Weekday, WeekPlan } from '../data/types'
import { MEAL_SLOTS, SLOT_LABELS, WEEKDAY_LABELS, WEEKDAYS } from '../data/types'
import { buildShoppingList, matchIngredient, usableInventory } from '../lib/ingredients'
import { sweetCourseLike } from '../lib/mealSlots'
import { totalMinutes } from '../lib/meals'
import { foodsToUseFirst } from '../lib/mustEat'
import type { Suggestion } from '../lib/planner'
import { suggestMeals } from '../lib/suggest'
import type { RecurringCap } from '../lib/timePatterns'
import {
  acceptMeal,
  applyDislikes,
  loadTaste,
  mainTaste,
  noteReject,
  preferTermsFrom,
  readReply,
  saveTaste,
} from '../lib/taste'
import { MealThumb } from './MealCellCard'
import { Button, TextArea } from './ui'

interface MealConversationProps {
  userId: string
  inventory: InventoryItem[]
  preferences: Preferences
  week: WeekPlan
  feedback: MealFeedback[]
  slots: MealSlot[]
  emptyOnly: boolean
  eatOutDays: Weekday[]
  dayThemes: Partial<Record<Weekday, string>>
  notes: string
  planStyle: string
  recurringCaps?: RecurringCap[]
  onClose: () => void
  onAccept: (suggestion: Suggestion, preferences: Preferences) => Promise<void>
  onSavePreferences: (preferences: Preferences) => Promise<void>
}

interface Turn {
  id: string
  role: 'assistant' | 'user'
  text: string
  suggestion?: Suggestion
  detail?: string
  actions?: boolean
  canSkip?: boolean
  clarify?: string
}

function buyCount(meals: Meal[], inventory: InventoryItem[]) {
  return buildShoppingList(meals, inventory, []).filter((row) => row.status !== 'purchased').length
}

function buyChange(before: number, after: number) {
  if (after === before) return `${after} still to buy. Adding this keeps the shopping list the same size.`
  if (after < before) return `${after} still to buy. Adding this shortens the list by ${before - after}.`
  return `${after} still to buy. Adding this adds ${after - before} to the list.`
}

function kitchenLine(meal: Meal, inventory: InventoryItem[]) {
  const stock = usableInventory(inventory)
  let have = 0
  for (const ingredient of meal.ingredients) {
    const status = matchIngredient(ingredient, stock).status
    if (status === 'have' || status === 'partial') have += 1
  }
  const buy = Math.max(0, meal.ingredients.length - have)
  return `${have} ingredient${have === 1 ? '' : 's'} on hand, ${buy} still to buy for this meal`
}

export function MealConversation({
  userId,
  inventory,
  preferences,
  week,
  feedback,
  slots,
  emptyOnly,
  eatOutDays,
  dayThemes,
  notes,
  planStyle,
  recurringCaps,
  onClose,
  onAccept,
  onSavePreferences,
}: MealConversationProps) {
  const queueRef = useRef<
    | {
        day: Weekday
        slot: MealSlot
        occupied: boolean
      }[]
    | null
  >(null)
  if (!queueRef.current) {
    const chosen = new Set(slots)
    queueRef.current = WEEKDAYS.flatMap((day) =>
      MEAL_SLOTS.filter((slot) => chosen.has(slot)).map((slot) => {
        const cell = week.cells.find((item) => item.day === day && item.slot === slot)
        return { day, slot, occupied: Boolean(cell?.meal) }
      }),
    ).filter((item) => !(emptyOnly && item.occupied))
  }
  const queue = queueRef.current

  const [localWeek, setLocalWeek] = useState(week)
  const [localPreferences, setLocalPreferences] = useState(preferences)
  const [localFeedback, setLocalFeedback] = useState(feedback)
  const [turns, setTurns] = useState<Turn[]>([])
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [excludedIds, setExcludedIds] = useState<string[]>([])
  const [excludedNames, setExcludedNames] = useState<string[]>([])
  const [avoid, setAvoid] = useState<string[]>([])
  const [banSweets, setBanSweets] = useState(false)
  const started = useRef(false)
  const useSoon = foodsToUseFirst(inventory).map((food) => food.name)

  function pushTurn(turn: Turn) {
    setTurns((current) => [...current.map((item) => ({ ...item, actions: false })), turn])
  }

  async function showSlot(
    index: number,
    weekPlan: WeekPlan,
    prefs: Preferences,
    history: MealFeedback[],
    shownIds: string[],
    shownNames: string[],
    avoided: string[],
    cookedTurns: number,
    skipSweets = banSweets,
  ) {
    let cursorIndex = index
    while (cursorIndex < queue.length && eatOutDays.includes(queue[cursorIndex].day)) {
      const item = queue[cursorIndex]
      pushTurn({
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `${WEEKDAY_LABELS[item.day]} ${SLOT_LABELS[item.slot].toLowerCase()} is eating out. Nothing to cook or buy. ${cursorIndex + 1} of ${queue.length}.`,
      })
      cursorIndex += 1
    }
    setCursor(cursorIndex)
    setExcludedIds(shownIds)
    setExcludedNames(shownNames)
    setAvoid(avoided)
    setBanSweets(skipSweets)
    if (cursorIndex >= queue.length) {
      pushTurn({ id: crypto.randomUUID(), role: 'assistant', text: 'The week is filled.' })
      return
    }
    const item = queue[cursorIndex]
    setBusy(true)
    try {
      const soon = cookedTurns < 3 ? useSoon : []
      const theme = dayThemes[item.day]?.trim()
      const message = [
        `Suggest ${WEEKDAY_LABELS[item.day]} ${item.slot}.`,
        theme ? `${WEEKDAY_LABELS[item.day]}: ${theme}` : null,
        notes.trim() ? notes.trim() : null,
        planStyle === 'quick' ? 'Keep this meal under 30 minutes.' : null,
        soon.length ? `Use food that is expiring: ${soon.join(', ')}.` : null,
      ]
        .filter(Boolean)
        .join(' ')
      const result = await suggestMeals({
        message,
        inventory,
        preferences: prefs,
        week: weekPlan,
        feedback: history,
        options: {
          wantWeek: false,
          emptyOnly: false,
          slots: [item.slot],
          onlyCell: { day: item.day, slot: item.slot },
          dayThemes,
          eatOutDays,
          recurringCaps,
          excludeIds: shownIds,
          excludeNames: shownNames,
          avoidIngredients: avoided,
          excludeSweetCourses: skipSweets && (item.slot === 'lunch' || item.slot === 'dinner'),
          preferTerms: preferTermsFrom(loadTaste(userId)),
          userId,
          mustUse: soon,
          forcePreferInventory: planStyle === 'on-hand' || planStyle === 'fewer-items',
        },
      })
      if (result.constraints.length) {
        const cells = weekPlan.cells.map((cell) => {
          const next = result.constraints.find((constraint) => constraint.day === cell.day && constraint.slot === cell.slot)
          return next ? { ...cell, constraint: next.constraint } : cell
        })
        weekPlan = { ...weekPlan, cells }
        setLocalWeek(weekPlan)
      }
      const suggestion = result.suggestions.find((entry) => entry.day === item.day && entry.slot === item.slot && !entry.meal.eatingOut)
      if (!suggestion) {
        pushTurn({
          id: crypto.randomUUID(),
          role: 'assistant',
          text: `${WEEKDAY_LABELS[item.day]} ${SLOT_LABELS[item.slot].toLowerCase()}: ${result.reply || 'No retrieved recipe fit this slot.'}`,
          canSkip: true,
        })
        return
      }
      const meals = weekPlan.cells.flatMap((cell) => (cell.meal ? [cell.meal] : []))
      const before = buyCount(meals, inventory)
      const replaced = weekPlan.cells.flatMap((cell) => {
        if (cell.day === item.day && cell.slot === item.slot) return [suggestion.meal]
        return cell.meal ? [cell.meal] : []
      })
      const minutes = totalMinutes(suggestion.meal)
      const soonLine = soon.length ? `Use soon: ${soon.join(', ')}.` : null
      pushTurn({
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `${WEEKDAY_LABELS[item.day]} ${SLOT_LABELS[item.slot].toLowerCase()} · ${cursorIndex + 1} of ${queue.length}`,
        suggestion,
        detail: [soonLine, kitchenLine(suggestion.meal, inventory), buyChange(before, buyCount(replaced, inventory)), minutes != null ? `${minutes} minutes` : null]
          .filter(Boolean)
          .join(' '),
        actions: true,
      })
    } catch (err) {
      pushTurn({
        id: crypto.randomUUID(),
        role: 'assistant',
        text: err instanceof Error ? err.message : 'Could not suggest that meal.',
      })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void showSlot(0, week, preferences, feedback, [], [], [], 0)
    // The walk-through starts once from the settings captured when it opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cookedCount = turns.filter((turn) => turn.suggestion).length

  async function addThis(suggestion: Suggestion) {
    if (busy) return
    setBusy(true)
    const learned = acceptMeal(loadTaste(userId), { ...suggestion.meal, cuisineHint: suggestion.recipe.cuisineHint }, localPreferences)
    saveTaste(userId, learned.memory)
    const prefs = learned.preferences
    if (learned.changed) await onSavePreferences(prefs)
    setLocalPreferences(prefs)
    const nextWeek: WeekPlan = {
      ...localWeek,
      cells: localWeek.cells.map((cell) =>
        cell.day === suggestion.day && cell.slot === suggestion.slot ? { ...cell, meal: suggestion.meal, finished: false } : cell,
      ),
    }
    setLocalWeek(nextWeek)
    const history = [...localFeedback, { id: crypto.randomUUID(), mealName: suggestion.meal.name, accepted: true, createdAt: new Date().toISOString() }]
    setLocalFeedback(history)
    try {
      await onAccept(suggestion, prefs)
      pushTurn({ id: crypto.randomUUID(), role: 'assistant', text: learned.note })
      await showSlot(cursor + 1, nextWeek, prefs, history, [], [], avoid, cookedCount + 1)
    } finally {
      setBusy(false)
    }
  }

  async function tryAnother(suggestion: Suggestion) {
    if (busy) return
    const main = mainTaste(suggestion.meal)
    const rejected = noteReject(loadTaste(userId), main)
    saveTaste(userId, rejected.memory)
    const shownIds = [...excludedIds, suggestion.recipe.providerId]
    const shownNames = [...excludedNames, suggestion.meal.name]
    const history = [
      ...localFeedback,
      { id: crypto.randomUUID(), mealName: suggestion.meal.name, accepted: false, createdAt: new Date().toISOString() },
    ]
    setLocalFeedback(history)
    const skipSweets =
      banSweets ||
      ((suggestion.slot === 'lunch' || suggestion.slot === 'dinner') && sweetCourseLike(suggestion.recipe))
    if (rejected.question) {
      setExcludedIds(shownIds)
      setExcludedNames(shownNames)
      setBanSweets(skipSweets)
      pushTurn({
        id: crypto.randomUUID(),
        role: 'assistant',
        text: skipSweets
          ? `${rejected.question} I'll also skip other desserts and sweet dishes for this meal.`
          : rejected.question,
        clarify: main,
        actions: true,
      })
      return
    }
    pushTurn({ id: crypto.randomUUID(), role: 'user', text: 'Try another' })
    if (skipSweets) {
      pushTurn({
        id: crypto.randomUUID(),
        role: 'assistant',
        text: "I'll skip desserts and other sweet dishes for this meal.",
      })
    }
    await showSlot(cursor, localWeek, localPreferences, history, shownIds, shownNames, avoid, cookedCount, skipSweets)
  }

  async function answerClarification(ingredient: string, choice: 'ingredient' | 'dish') {
    if (busy) return
    if (choice === 'ingredient') {
      const next = applyDislikes(localPreferences, [ingredient])
      if (next.changed) await onSavePreferences(next.preferences)
      setLocalPreferences(next.preferences)
      const avoided = [...avoid, ingredient]
      pushTurn({ id: crypto.randomUUID(), role: 'assistant', text: `I'll leave ${ingredient} out.` })
      await showSlot(cursor, localWeek, next.preferences, localFeedback, excludedIds, excludedNames, avoided, cookedCount)
      return
    }
    pushTurn({ id: crypto.randomUUID(), role: 'assistant', text: 'Got it. I will skip that dish and keep the ingredient.' })
    await showSlot(cursor, localWeek, localPreferences, localFeedback, excludedIds, excludedNames, avoid, cookedCount)
  }

  async function sendReply(suggestion: Suggestion) {
    const text = reply.trim()
    if (!text || busy) return
    setReply('')
    const reading = readReply(text)
    let prefs = localPreferences
    if (reading.disliked.length) {
      const next = applyDislikes(prefs, reading.disliked)
      prefs = next.preferences
      if (next.changed) await onSavePreferences(prefs)
      setLocalPreferences(prefs)
    }
    pushTurn({ id: crypto.randomUUID(), role: 'user', text })
    if (reading.note) pushTurn({ id: crypto.randomUUID(), role: 'assistant', text: reading.note })
    const message = [
      `Suggest ${WEEKDAY_LABELS[suggestion.day]} ${suggestion.slot}.`,
      text,
      reading.maxMinutes != null ? `Keep this meal under ${reading.maxMinutes} minutes.` : null,
    ]
      .filter(Boolean)
      .join(' ')
    setBusy(true)
    try {
      const result = await suggestMeals({
        message,
        inventory,
        preferences: prefs,
        week: localWeek,
        feedback: localFeedback,
        options: {
          wantWeek: false,
          slots: [suggestion.slot],
          onlyCell: { day: suggestion.day, slot: suggestion.slot },
          dayThemes,
          eatOutDays,
          recurringCaps,
          excludeIds: [...excludedIds, suggestion.recipe.providerId],
          excludeNames: [...excludedNames, suggestion.meal.name],
          avoidIngredients: [...avoid, ...reading.disliked],
          excludeSweetCourses:
            (banSweets || sweetCourseLike(suggestion.recipe)) &&
            (suggestion.slot === 'lunch' || suggestion.slot === 'dinner'),
          preferTerms: [...preferTermsFrom(loadTaste(userId)), ...reading.focus],
          userId,
          forcePreferInventory: planStyle === 'on-hand' || planStyle === 'fewer-items',
        },
      })
      const next = result.suggestions.find((entry) => entry.day === suggestion.day && entry.slot === suggestion.slot && !entry.meal.eatingOut)
      if (!next) {
        pushTurn({ id: crypto.randomUUID(), role: 'assistant', text: result.reply || 'No other retrieved recipe fit that reply.' })
        return
      }
      setExcludedIds((current) => [...current, suggestion.recipe.providerId])
      setExcludedNames((current) => [...current, suggestion.meal.name])
      if (reading.disliked.length) setAvoid((current) => [...current, ...reading.disliked])
      const meals = localWeek.cells.flatMap((cell) => (cell.meal ? [cell.meal] : []))
      const before = buyCount(meals, inventory)
      const replaced = localWeek.cells.flatMap((cell) => {
        if (cell.day === suggestion.day && cell.slot === suggestion.slot) return [next.meal]
        return cell.meal ? [cell.meal] : []
      })
      const minutes = totalMinutes(next.meal)
      pushTurn({
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `${WEEKDAY_LABELS[next.day]} ${SLOT_LABELS[next.slot].toLowerCase()} · ${cursor + 1} of ${queue.length}`,
        suggestion: next,
        detail: [kitchenLine(next.meal, inventory), buyChange(before, buyCount(replaced, inventory)), minutes != null ? `${minutes} minutes` : null]
          .filter(Boolean)
          .join(' '),
        actions: true,
      })
    } catch (err) {
      pushTurn({
        id: crypto.randomUUID(),
        role: 'assistant',
        text: err instanceof Error ? err.message : 'Could not change that meal.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-line bg-canvas/40 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">Walk through the week</h3>
        <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="max-h-[32rem] space-y-3 overflow-y-auto">
        {turns.map((turn) => (
          <div key={turn.id} className={turn.role === 'user' ? 'ml-8 rounded-2xl bg-primary px-3 py-2 text-sm text-white' : 'mr-4 rounded-2xl bg-surface px-3 py-2 text-sm text-ink'}>
            <p>{turn.text}</p>
            {turn.suggestion ? (
              <div className="mt-2 flex gap-3">
                <MealThumb meal={turn.suggestion.meal} size={52} />
                <div className="min-w-0">
                  <p className="font-semibold">{turn.suggestion.meal.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{turn.suggestion.meal.why || turn.suggestion.reasons.join(' ')}</p>
                  {turn.detail ? <p className="mt-1 text-xs text-ink">{turn.detail}</p> : null}
                </div>
              </div>
            ) : null}
            {turn.canSkip ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-2 px-3 py-1.5"
                disabled={busy}
                onClick={() => void showSlot(cursor + 1, localWeek, localPreferences, localFeedback, [], [], avoid, cookedCount)}
              >
                Skip this slot
              </Button>
            ) : null}
            {turn.actions && turn.clarify ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" className="px-3 py-1.5" disabled={busy} onClick={() => void answerClarification(turn.clarify!, 'ingredient')}>
                  Leave {turn.clarify} out
                </Button>
                <Button type="button" variant="ghost" className="px-3 py-1.5" disabled={busy} onClick={() => void answerClarification(turn.clarify!, 'dish')}>
                  Just this dish
                </Button>
              </div>
            ) : null}
            {turn.actions && turn.suggestion ? (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" className="px-3 py-1.5" disabled={busy} onClick={() => void addThis(turn.suggestion!)}>
                    Add this
                  </Button>
                  <Button type="button" variant="ghost" className="px-3 py-1.5" disabled={busy} onClick={() => void tryAnother(turn.suggestion!)}>
                    Try another
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-3 py-1.5"
                    disabled={busy}
                    onClick={() => void showSlot(cursor + 1, localWeek, localPreferences, localFeedback, [], [], avoid, cookedCount)}
                  >
                    Skip this slot
                  </Button>
                </div>
                <div className="flex gap-2">
                  <TextArea rows={2} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Try “faster” or “use the spinach”" />
                  <Button type="button" variant="ghost" disabled={busy || !reply.trim()} onClick={() => void sendReply(turn.suggestion!)}>
                    Send
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
        {busy ? <p className="text-xs text-muted">Looking for a retrieved recipe…</p> : null}
      </div>
    </div>
  )
}
