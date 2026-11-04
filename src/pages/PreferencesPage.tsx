import { useEffect, useState, type FormEvent } from 'react'
import { CheckboxOptionGroup } from '../components/CheckboxOptionGroup'
import { Button, ErrorText, FieldLabel, TextArea, TextSelect } from '../components/ui'
import { useSession } from '../context/SessionContext'
import type { Preferences, SkillLevel } from '../data/types'
import { emptyPreferences, normalizePreferences } from '../data/types'
import { COMMON_ALLERGIES, COMMON_CUISINES, COMMON_DIETARY } from '../lib/preferenceOptions'
import { RECIPE_PUBLISHERS } from '../lib/recipeSources'

function listToText(values: string[]) {
  return values.join(', ')
}

function textToList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function PreferencesPage() {
  const { store } = useSession()
  const [draft, setDraft] = useState<Preferences>(emptyPreferences())
  const [saved, setSaved] = useState<Preferences>(emptyPreferences())
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!store) return
    void store.getPreferences().then((prefs) => {
      const next = normalizePreferences(prefs)
      setDraft(next)
      setSaved(next)
    })
  }, [store])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!store) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await store.savePreferences(draft)
      setSaved(draft)
      setMessage('Preferences saved. Allergies and dietary restrictions stay strict for the assistant.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save preferences.')
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    setDraft(saved)
    setError(null)
    setMessage(null)
  }

  return (
    <div data-tutorial="preferences" className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Food preferences</h1>
      <p className="mt-1 text-sm text-muted">
        The assistant treats allergies and dietary restrictions as hard constraints, never optional hints.
      </p>

      <form className="soft-shadow mt-6 space-y-4 rounded-2xl border border-line bg-surface p-5" onSubmit={onSubmit}>
        <CheckboxOptionGroup
          label="Food allergies"
          options={COMMON_ALLERGIES}
          values={draft.allergies}
          onChange={(allergies) => setDraft((d) => ({ ...d, allergies }))}
          hint="Strictly excluded from suggestions."
          otherPlaceholder="Other allergies (comma-separated)"
        />
        <CheckboxOptionGroup
          label="Dietary restrictions"
          options={COMMON_DIETARY}
          values={draft.dietary}
          onChange={(dietary) => setDraft((d) => ({ ...d, dietary }))}
          hint="Treated as hard rules for meal matching."
          otherPlaceholder="Other dietary rules (comma-separated)"
        />
        <TagField
          label="Favorite foods"
          value={listToText(draft.favorites)}
          onChange={(value) => setDraft((d) => ({ ...d, favorites: textToList(value) }))}
        />
        <TagField
          label="Disliked foods"
          value={listToText(draft.disliked)}
          onChange={(value) => setDraft((d) => ({ ...d, disliked: textToList(value) }))}
        />
        <CheckboxOptionGroup
          label="Preferred cuisines"
          options={COMMON_CUISINES}
          values={draft.cuisines}
          onChange={(cuisines) => setDraft((d) => ({ ...d, cuisines }))}
          otherPlaceholder="Other cuisines (comma-separated)"
        />
        <div>
          <FieldLabel>Preferred recipe websites</FieldLabel>
          <p className="mb-2 text-xs text-muted">
            Planora searches these sites via a local/Vercel API and reads public Recipe structured data (JSON-LD) when
            available. Some publishers block bots or omit structured data; NYT Cooking is skipped. Spoonacular remains
            an optional backup.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {RECIPE_PUBLISHERS.map((publisher) => {
              const checked = draft.recipeSites.includes(publisher.id)
              return (
                <label
                  key={publisher.id}
                  className="flex items-start gap-2 rounded-xl border border-line bg-canvas/40 px-3 py-2 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        recipeSites: e.target.checked
                          ? [...d.recipeSites, publisher.id]
                          : d.recipeSites.filter((id) => id !== publisher.id),
                      }))
                    }
                  />
                  <span>
                    <span className="font-medium">{publisher.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">{publisher.domains[0]}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="skill">Cooking skill level</FieldLabel>
          <TextSelect
            id="skill"
            value={draft.skill}
            onChange={(e) => setDraft((d) => ({ ...d, skill: e.target.value as SkillLevel }))}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </TextSelect>
        </div>
        <TagField
          label="Available cooking equipment"
          value={listToText(draft.equipment)}
          onChange={(value) => setDraft((d) => ({ ...d, equipment: textToList(value) }))}
          hint="Example: stovetop, oven, air fryer, blender"
        />
        <div>
          <FieldLabel htmlFor="instructions">General instructions for the AI</FieldLabel>
          <TextArea
            id="instructions"
            rows={4}
            value={draft.instructions}
            onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))}
            placeholder="Prefer one-pan dinners. Avoid spicy food on weeknights."
          />
        </div>
        <ErrorText>{error}</ErrorText>
        {message ? <p className="text-sm text-success">{message}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save preferences'}
          </Button>
          <Button type="button" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}

function TagField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <TextArea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}
