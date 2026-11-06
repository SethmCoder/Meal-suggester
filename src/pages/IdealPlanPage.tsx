import { useState } from 'react'
import { Button, TextInput } from '../components/ui'
import { useSession } from '../context/SessionContext'
import { MEAL_SLOTS, SLOT_LABELS, WEEKDAY_LABELS, WEEKDAYS } from '../data/types'
import { emptyIdealPlan, idealKey, loadIdealPlan, saveIdealPlan, type IdealPlan } from '../lib/idealPlan'

export function IdealPlanPage() {
  const { profile } = useSession()
  const [draft, setDraft] = useState<IdealPlan>(() => (profile ? loadIdealPlan(profile.id) : emptyIdealPlan()))
  const [message, setMessage] = useState<string | null>(null)

  function update(day: (typeof WEEKDAYS)[number], slot: (typeof MEAL_SLOTS)[number], value: string) {
    setDraft((current) => ({ ...current, [idealKey(day, slot)]: value }))
    setMessage(null)
  }

  function save() {
    if (!profile) return
    saveIdealPlan(profile.id, draft)
    setDraft(loadIdealPlan(profile.id))
    setMessage('Saved. Suggestions will use this as an example week.')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Ideal meals</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Write the meals you wish a week looked like. The assistant treats these as examples and still only suggests recipes it actually retrieved. Allergies stay a hard filter.
          </p>
        </div>
        <Button type="button" onClick={save}>
          Save ideal week
        </Button>
      </div>
      {message ? <p className="text-sm font-medium text-primary">{message}</p> : null}
      <div className="soft-shadow overflow-x-auto rounded-2xl border border-line bg-surface p-4">
        <div className="grid min-w-[720px] grid-cols-[110px_repeat(5,minmax(0,1fr))] gap-2">
          <div />
          {WEEKDAYS.map((day) => (
            <p key={day} className="font-display text-center text-base font-semibold text-primary">
              {WEEKDAY_LABELS[day]}
            </p>
          ))}
          {MEAL_SLOTS.map((slot) => (
            <div key={slot} className="contents">
              <div className="flex items-center text-sm font-semibold text-ink">{SLOT_LABELS[slot]}</div>
              {WEEKDAYS.map((day) => (
                <TextInput
                  key={idealKey(day, slot)}
                  aria-label={`${WEEKDAY_LABELS[day]} ${SLOT_LABELS[slot]}`}
                  value={draft[idealKey(day, slot)] ?? ''}
                  onChange={(event) => update(day, slot, event.target.value)}
                  placeholder="e.g. salmon tacos"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">Saved on this device for this account. Leave a slot blank when you do not have an example.</p>
    </div>
  )
}
