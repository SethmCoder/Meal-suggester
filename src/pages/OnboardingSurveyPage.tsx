import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AppLogo } from '../components/AppLogo'
import { CheckboxOptionGroup } from '../components/CheckboxOptionGroup'
import { Button, ErrorText, FieldLabel, TextArea, TextSelect } from '../components/ui'
import { useSession } from '../context/SessionContext'
import type { Preferences, SkillLevel } from '../data/types'
import { emptyPreferences } from '../data/types'
import { COMMON_ALLERGIES, COMMON_CUISINES, COMMON_DIETARY } from '../lib/preferenceOptions'

const STEPS = [
  { id: 'allergies', title: 'Any food allergies?', subtitle: 'We treat these as hard exclusions.' },
  { id: 'dietary', title: 'Dietary restrictions?', subtitle: 'Vegetarian, gluten-free, and similar rules stay strict.' },
  { id: 'favorites', title: 'Foods you love — and don’t', subtitle: 'Favorites get preferred; dislikes stay out of suggestions.' },
  { id: 'cuisines', title: 'Preferred cuisines', subtitle: 'We’ll lean toward these when suggesting meals.' },
  { id: 'extras', title: 'Cooking setup (optional)', subtitle: 'Skill, equipment, and any notes for the assistant.' },
] as const

function listToText(values: string[]) {
  return values.join(', ')
}

function textToList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function OnboardingSurveyPage() {
  const { profile, store, setProfile } = useSession()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Preferences>(emptyPreferences())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!profile || !store) return <Navigate to="/" replace />
  if (profile.surveyCompleted) return <Navigate to="/app" replace />

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  async function finish(prefs: Preferences) {
    setBusy(true)
    setError(null)
    try {
      await store!.savePreferences(prefs)
      const next = await store!.updateProfile({ surveyCompleted: true })
      setProfile(next)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your preferences.')
    } finally {
      setBusy(false)
    }
  }

  function skipSurvey() {
    // Soft-skip: keep anything already answered, fill the rest with defaults, mark complete.
    void finish(draft)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="card-shadow w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center gap-4 bg-primary px-6 py-5 text-white">
          <AppLogo size={72} />
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold tracking-tight">Welcome to Planora</p>
            <p className="text-sm text-white/85">Tell us what you like so meals fit you from day one.</p>
          </div>
        </div>

        <div className="border-b border-line bg-canvas/40 px-6 py-3">
          <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted">
            <span>
              Step {step + 1} of {STEPS.length}
            </span>
            <button
              type="button"
              className="text-primary hover:underline disabled:opacity-50"
              onClick={skipSurvey}
              disabled={busy}
            >
              Skip for now
            </button>
          </div>
          <div className="mt-2 flex gap-1.5">
            {STEPS.map((item, index) => (
              <div
                key={item.id}
                className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-primary' : 'bg-line'}`}
              />
            ))}
          </div>
        </div>

        <div className="px-6 py-6">
          <h1 className="text-xl font-bold text-ink">{current.title}</h1>
          <p className="mt-1 text-sm text-muted">{current.subtitle}</p>

          <div className="mt-6 space-y-4">
            {current.id === 'allergies' ? (
              <CheckboxOptionGroup
                label="Food allergies"
                options={COMMON_ALLERGIES}
                values={draft.allergies}
                onChange={(allergies) => setDraft((d) => ({ ...d, allergies }))}
                hint="Strictly excluded from suggestions."
                otherPlaceholder="Other allergies (comma-separated)"
              />
            ) : null}

            {current.id === 'dietary' ? (
              <CheckboxOptionGroup
                label="Dietary restrictions"
                options={COMMON_DIETARY}
                values={draft.dietary}
                onChange={(dietary) => setDraft((d) => ({ ...d, dietary }))}
                hint="Treated as hard rules for meal matching."
                otherPlaceholder="Other dietary rules (comma-separated)"
              />
            ) : null}

            {current.id === 'favorites' ? (
              <>
                <TagField
                  label="Favorite foods"
                  value={listToText(draft.favorites)}
                  onChange={(value) => setDraft((d) => ({ ...d, favorites: textToList(value) }))}
                  hint="Example: salmon, avocado, pasta"
                />
                <TagField
                  label="Disliked foods"
                  value={listToText(draft.disliked)}
                  onChange={(value) => setDraft((d) => ({ ...d, disliked: textToList(value) }))}
                  hint="Example: cilantro, olives, mushrooms"
                />
              </>
            ) : null}

            {current.id === 'cuisines' ? (
              <CheckboxOptionGroup
                label="Preferred cuisines"
                options={COMMON_CUISINES}
                values={draft.cuisines}
                onChange={(cuisines) => setDraft((d) => ({ ...d, cuisines }))}
                otherPlaceholder="Other cuisines (comma-separated)"
              />
            ) : null}

            {current.id === 'extras' ? (
              <>
                <div>
                  <FieldLabel htmlFor="onboarding-skill">Cooking skill level</FieldLabel>
                  <TextSelect
                    id="onboarding-skill"
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
                  <FieldLabel htmlFor="onboarding-instructions">General instructions for the AI</FieldLabel>
                  <TextArea
                    id="onboarding-instructions"
                    rows={3}
                    value={draft.instructions}
                    onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))}
                    placeholder="Prefer one-pan dinners. Avoid spicy food on weeknights."
                  />
                </div>
              </>
            ) : null}
          </div>

          <div className="mt-4">
            <ErrorText>{error}</ErrorText>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {step > 0 ? (
              <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={busy}>
                Back
              </Button>
            ) : null}
            <div className="flex-1" />
            {isLast ? (
              <Button type="button" onClick={() => void finish(draft)} disabled={busy}>
                {busy ? 'Saving…' : 'Finish'}
              </Button>
            ) : (
              <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={busy}>
                Next
              </Button>
            )}
          </div>
          <p className="mt-4 text-xs text-muted">
            You can change all of this anytime under Food Preferences.
          </p>
        </div>
      </div>
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
  const id = `onboarding-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <TextArea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}
