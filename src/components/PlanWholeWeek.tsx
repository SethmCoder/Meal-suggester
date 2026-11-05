import { useMemo, useState } from 'react'
import { CalendarRange, Loader2, Sparkles } from 'lucide-react'
import type { InventoryItem, MealFeedback, MealSlot, Preferences, Weekday, WeekPlan } from '../data/types'
import type { RecurringCap } from '../lib/timePatterns'
import { MEAL_SLOTS, SLOT_LABELS, WEEKDAY_LABELS, WEEKDAYS } from '../data/types'
import { suggestMeals } from '../lib/suggest'
import type { Suggestion } from '../lib/planner'
import { MealThumb } from './MealCellCard'
import { Badge, Button, FieldLabel, TextArea, TextInput } from './ui'

interface PlanWholeWeekProps {
  inventory: InventoryItem[]
  preferences: Preferences
  week: WeekPlan
  feedback: MealFeedback[]
  onApplyConstraints: (constraints: Awaited<ReturnType<typeof suggestMeals>>['constraints']) => Promise<void>
  onApplyAll: (suggestions: Suggestion[]) => Promise<void>
  onEditSuggestion: (suggestion: Suggestion) => void
  recurringCaps?: RecurringCap[]
}

const DEFAULT_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

export function PlanWholeWeek({
  inventory,
  preferences,
  week,
  feedback,
  onApplyConstraints,
  onApplyAll,
  onEditSuggestion,
  recurringCaps,
}: PlanWholeWeekProps) {
  const [dayThemes, setDayThemes] = useState<Record<Weekday, string>>({
    monday: '',
    tuesday: '',
    wednesday: '',
    thursday: '',
    friday: '',
  })
  const [notes, setNotes] = useState('')
  const [slots, setSlots] = useState<MealSlot[]>(DEFAULT_SLOTS)
  const [emptyOnly, setEmptyOnly] = useState(true)
  const [busy, setBusy] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState<string | null>(null)
  const [mode, setMode] = useState<'ai' | 'match' | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])

  const themeSummary = useMemo(
    () =>
      WEEKDAYS.map((day) => {
        const theme = dayThemes[day].trim()
        return theme ? `${WEEKDAY_LABELS[day]}: ${theme}` : null
      }).filter(Boolean),
    [dayThemes],
  )

  function toggleSlot(slot: MealSlot) {
    setSlots((prev) => {
      if (prev.includes(slot)) {
        const next = prev.filter((item) => item !== slot)
        return next.length ? next : prev
      }
      return [...prev, slot]
    })
  }

  async function planWeek() {
    if (busy) return
    setBusy(true)
    setError(null)
    setReply(null)
    setSuggestions([])
    setMode(null)
    try {
      const lines = [
        'Plan the whole week.',
        ...WEEKDAYS.map((day) => {
          const theme = dayThemes[day].trim()
          return theme ? `${WEEKDAY_LABELS[day]}: ${theme}` : null
        }).filter(Boolean),
        notes.trim() ? `Extra notes: ${notes.trim()}` : null,
        `Fill slots: ${slots.join(', ')}.`,
        emptyOnly ? 'Only fill empty meal slots.' : 'Replace meals already on the planner if needed.',
      ].filter(Boolean)

      const result = await suggestMeals({
        message: lines.join('\n'),
        inventory,
        preferences,
        week,
        feedback,
        options: {
          wantWeek: true,
          emptyOnly,
          slots,
          dayThemes: Object.fromEntries(
            WEEKDAYS.filter((day) => dayThemes[day].trim()).map((day) => [day, dayThemes[day].trim()]),
          ) as Partial<Record<Weekday, string>>,
          recurringCaps,
        },
      })

      if (result.constraints.length) await onApplyConstraints(result.constraints)
      setReply(result.reply)
      setMode(result.mode)
      setSuggestions(result.suggestions)
      if (!result.suggestions.length) {
        setError('No meals fit that week request. Try broader day themes or fewer restrictions.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not plan the week.')
    } finally {
      setBusy(false)
    }
  }

  async function applyAll() {
    if (!suggestions.length || applying) return
    setApplying(true)
    try {
      await onApplyAll(suggestions)
      setSuggestions([])
      setReply('Applied those meals to your week planner.')
      setMode(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply the week plan.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <section data-tutorial="plan-week" className="soft-shadow rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-ink">Plan whole week</h2>
          </div>
          <p className="mt-1 text-sm text-muted">
            Describe cuisine or vibes per day (optional), then generate Monday–Friday meals from retrieved recipes.
          </p>
        </div>
        <Button type="button" onClick={() => void planWeek()} disabled={busy} className="shrink-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? 'Planning…' : 'Plan whole week'}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {WEEKDAYS.map((day) => (
          <div key={day}>
            <FieldLabel htmlFor={`theme-${day}`}>{WEEKDAY_LABELS[day]}</FieldLabel>
            <TextInput
              id={`theme-${day}`}
              value={dayThemes[day]}
              onChange={(e) => setDayThemes((prev) => ({ ...prev, [day]: e.target.value }))}
              placeholder="e.g. Italian, tacos…"
            />
          </div>
        ))}
      </div>

      <div className="mt-4">
        <FieldLabel htmlFor="week-notes">Extra notes</FieldLabel>
        <TextArea
          id="week-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Example: keep dinners under 40 minutes, use chicken twice, lighter lunches"
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3">
          {MEAL_SLOTS.map((slot) => {
            const checked = slots.includes(slot)
            return (
              <label key={slot} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={checked} onChange={() => toggleSlot(slot)} />
                {SLOT_LABELS[slot]}
              </label>
            )
          })}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={emptyOnly} onChange={(e) => setEmptyOnly(e.target.checked)} />
          Only fill empty slots
        </label>
      </div>

      {themeSummary.length ? (
        <p className="mt-3 text-xs text-muted">Themes: {themeSummary.join(' · ')}</p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {reply ? (
        <div className="mt-3 rounded-xl bg-canvas px-3 py-2 text-sm text-ink">
          <div className="flex flex-wrap items-center gap-2">
            {mode ? (
              <Badge tone={mode === 'ai' ? 'primary' : 'neutral'}>
                {mode === 'ai' ? 'Model ranked retrieved recipes' : 'Local recipe match'}
              </Badge>
            ) : null}
            <p>{reply}</p>
          </div>
        </div>
      ) : null}

      {suggestions.length ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-ink">
              {suggestions.length} proposed meal{suggestions.length === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void applyAll()} disabled={applying}>
                {applying ? 'Applying…' : 'Apply all to planner'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSuggestions([])} disabled={applying}>
                Discard
              </Button>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((suggestion) => (
              <div
                key={`${suggestion.day}-${suggestion.slot}-${suggestion.meal.id}`}
                className="rounded-xl border border-line bg-canvas/50 p-3"
              >
                <div className="flex gap-3">
                  <MealThumb meal={suggestion.meal} size={52} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold capitalize text-ink">
                      {suggestion.day} {suggestion.slot}
                    </p>
                    <p className="truncate text-sm text-ink">{suggestion.meal.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      {suggestion.meal.why || suggestion.reasons.join(' ')}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={() => onEditSuggestion(suggestion)}>
                    Modify
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-3 py-1.5"
                    onClick={() =>
                      setSuggestions((prev) =>
                        prev.filter(
                          (item) => !(item.day === suggestion.day && item.slot === suggestion.slot && item.meal.id === suggestion.meal.id),
                        ),
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
