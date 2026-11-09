import { useEffect, useMemo, useState } from 'react'
import { Button, TextInput } from '../components/ui'
import { useSession } from '../context/SessionContext'
import { MEAL_SLOTS, SLOT_LABELS, WEEKDAY_LABELS, WEEKDAYS } from '../data/types'
import { emptyIdealPlan, filledIdealMeals, idealKey, loadIdealPlan, saveIdealPlan, type IdealPlan } from '../lib/idealPlan'

export function IdealPlanPage() {
  const { profile } = useSession()
  const [draft, setDraft] = useState<IdealPlan>(() => (profile ? loadIdealPlan(profile.id) : emptyIdealPlan()))
  const [saved, setSaved] = useState<IdealPlan>(() => (profile ? loadIdealPlan(profile.id) : emptyIdealPlan()))
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    const next = loadIdealPlan(profile.id)
    setDraft(next)
    setSaved(next)
  }, [profile])

  const filledCount = useMemo(() => filledIdealMeals(draft).length, [draft])
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved])

  function update(day: (typeof WEEKDAYS)[number], slot: (typeof MEAL_SLOTS)[number], value: string) {
    setDraft((current) => ({ ...current, [idealKey(day, slot)]: value }))
    setMessage(null)
  }

  function save() {
    if (!profile) return
    saveIdealPlan(profile.id, draft)
    const next = loadIdealPlan(profile.id)
    setDraft(next)
    setSaved(next)
    setMessage(
      filledIdealMeals(next).length
        ? 'Saved. Suggestions will lean toward these examples when a matching recipe is available.'
        : 'Saved an empty ideal week. Suggestions will not use example meals until you add some.',
    )
  }

  function clearAll() {
    setDraft(emptyIdealPlan())
    setMessage(null)
  }

  function discard() {
    setDraft(saved)
    setMessage(null)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Ideal meals</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Sketch the week you want. The assistant treats filled slots as examples, searches for similar retrieved recipes, and keeps allergies as a hard filter.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
            {filledCount} of {WEEKDAYS.length * MEAL_SLOTS.length} filled
          </span>
          <Button type="button" variant="ghost" onClick={clearAll} disabled={!filledCount && !dirty}>
            Clear
          </Button>
          <Button type="button" variant="ghost" onClick={discard} disabled={!dirty}>
            Discard
          </Button>
          <Button type="button" onClick={save} disabled={!profile || !dirty}>
            Save ideal week
          </Button>
        </div>
      </div>

      {message ? (
        <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-medium text-primary">{message}</p>
      ) : null}

      {/* Mobile: one day per card */}
      <div className="space-y-3 md:hidden">
        {WEEKDAYS.map((day) => (
          <section key={day} className="soft-shadow rounded-2xl border border-line bg-surface p-4">
            <h2 className="font-display text-lg font-semibold text-primary">{WEEKDAY_LABELS[day]}</h2>
            <div className="mt-3 space-y-3">
              {MEAL_SLOTS.map((slot) => (
                <label key={slot} className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                    {SLOT_LABELS[slot]}
                  </span>
                  <TextInput
                    aria-label={`${WEEKDAY_LABELS[day]} ${SLOT_LABELS[slot]}`}
                    value={draft[idealKey(day, slot)] ?? ''}
                    onChange={(event) => update(day, slot, event.target.value)}
                    placeholder="e.g. oatmeal"
                  />
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Desktop: week grid */}
      <div className="soft-shadow hidden overflow-hidden rounded-2xl border border-line bg-surface md:block">
        <div className="grid grid-cols-[7.5rem_repeat(5,minmax(0,1fr))] border-b border-line bg-canvas/70">
          <div className="px-4 py-3" />
          {WEEKDAYS.map((day) => (
            <p key={day} className="font-display px-2 py-3 text-center text-base font-semibold text-primary">
              {WEEKDAY_LABELS[day]}
            </p>
          ))}
        </div>
        {MEAL_SLOTS.map((slot, slotIndex) => (
          <div
            key={slot}
            className={`grid grid-cols-[7.5rem_repeat(5,minmax(0,1fr))] items-center gap-2 px-3 py-3 ${
              slotIndex < MEAL_SLOTS.length - 1 ? 'border-b border-line' : ''
            }`}
          >
            <div className="px-1 text-sm font-semibold text-ink">{SLOT_LABELS[slot]}</div>
            {WEEKDAYS.map((day) => {
              const key = idealKey(day, slot)
              const filled = Boolean(draft[key]?.trim())
              return (
                <TextInput
                  key={key}
                  aria-label={`${WEEKDAY_LABELS[day]} ${SLOT_LABELS[slot]}`}
                  value={draft[key] ?? ''}
                  onChange={(event) => update(day, slot, event.target.value)}
                  placeholder="e.g. oatmeal"
                  className={filled ? 'border-primary/30 bg-primary/[0.04]' : 'bg-canvas/40'}
                />
              )
            })}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted">
        Saved on this device for this account. Leave a slot blank when you do not have an example. This does not fill your live week by itself.
      </p>
    </div>
  )
}
