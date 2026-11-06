import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AppLogo } from '../components/AppLogo'
import { Button, ErrorText, TextArea } from '../components/ui'
import { useSession } from '../context/SessionContext'
import type { Preferences } from '../data/types'
import { emptyPreferences } from '../data/types'
import { COMMON_ALLERGIES, COMMON_CUISINES, COMMON_DIETARY } from '../lib/preferenceOptions'

const QUESTIONS = [
  'Who is eating, and about how old is each person?',
  'Any food allergies?',
  'What do you like to eat, and what should I leave out?',
  'When did you last plan meals, and what should this week feel like?',
] as const

function textToList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function toggleValue(list: string[], value: string) {
  return list.some((item) => item.toLowerCase() === value.toLowerCase())
    ? list.filter((item) => item.toLowerCase() !== value.toLowerCase())
    : [...list, value]
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm ${selected ? 'border-primary bg-primary text-white' : 'border-line bg-surface text-ink'}`}
    >
      {label}
    </button>
  )
}

export function OnboardingSurveyPage() {
  const { profile, store, setProfile } = useSession()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Preferences>(emptyPreferences())
  const [household, setHousehold] = useState('')
  const [otherAllergy, setOtherAllergy] = useState('')
  const [likes, setLikes] = useState('')
  const [dislikes, setDislikes] = useState('')
  const [lastPlanned, setLastPlanned] = useState('')
  const [weekFeel, setWeekFeel] = useState('')
  const [answers, setAnswers] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!profile || !store) return <Navigate to="/" replace />
  if (profile.surveyCompleted) return <Navigate to="/app" replace />

  function preferencesFromDraft(): Preferences {
    const notes = [
      household.trim() ? `Household: ${household.trim()}` : null,
      lastPlanned.trim() ? `Last time planning meals: ${lastPlanned.trim()}` : null,
      weekFeel.trim() ? `This week: ${weekFeel.trim()}` : null,
    ].filter(Boolean)
    return {
      ...draft,
      allergies: [...draft.allergies, ...textToList(otherAllergy)].filter(
        (item, index, list) => list.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index,
      ),
      favorites: textToList(likes),
      disliked: textToList(dislikes),
      instructions: notes.join('\n'),
    }
  }

  async function finish() {
    setBusy(true)
    setError(null)
    try {
      await store!.savePreferences(preferencesFromDraft())
      const next = await store!.updateProfile({ surveyCompleted: true })
      setProfile(next)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your preferences.')
    } finally {
      setBusy(false)
    }
  }

  function currentAnswer() {
    if (step === 0) return household.trim() || 'Skipped'
    if (step === 1) {
      const names = [...draft.allergies, ...textToList(otherAllergy)]
      return names.length ? names.join(', ') : 'No allergies'
    }
    if (step === 2) {
      const parts = [
        draft.dietary.length ? draft.dietary.join(', ') : null,
        draft.cuisines.length ? draft.cuisines.join(', ') : null,
        likes.trim() ? `likes ${likes.trim()}` : null,
        dislikes.trim() ? `leave out ${dislikes.trim()}` : null,
      ].filter(Boolean)
      return parts.length ? parts.join(' · ') : 'Skipped'
    }
    const parts = [lastPlanned.trim(), weekFeel.trim()].filter(Boolean)
    return parts.length ? parts.join(' · ') : 'Skipped'
  }

  function continueQuestion() {
    const nextAnswers = [...answers, currentAnswer()]
    setAnswers(nextAnswers)
    if (step === QUESTIONS.length - 1) {
      void finish()
      return
    }
    setStep((value) => value + 1)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="card-shadow w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center gap-4 border-b border-line bg-canvas px-6 py-5 text-ink">
          <AppLogo size={72} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-3xl font-semibold tracking-tight">Welcome to Planora</p>
            <p className="text-sm text-muted">A few questions, only this first time.</p>
          </div>
        </div>
        <div className="flex items-center justify-between border-b border-line px-6 py-3 text-xs font-medium text-muted">
          <span>
            Question {step + 1} of {QUESTIONS.length}
          </span>
          <button type="button" className="text-primary hover:underline disabled:opacity-50" onClick={() => void finish()} disabled={busy}>
            Skip for now
          </button>
        </div>
        <div className="space-y-3 px-6 py-6">
          {answers.map((answer, index) => (
            <div key={QUESTIONS[index]} className="space-y-2">
              <p className="mr-8 rounded-2xl bg-canvas px-3 py-2 text-sm text-ink">{QUESTIONS[index]}</p>
              <p className="ml-8 rounded-2xl bg-primary px-3 py-2 text-sm text-white">{answer}</p>
            </div>
          ))}
          <p className="mr-8 rounded-2xl bg-canvas px-3 py-2 text-sm text-ink">{QUESTIONS[step]}</p>

          {step === 0 ? (
            <TextArea
              rows={3}
              value={household}
              onChange={(event) => setHousehold(event.target.value)}
              placeholder="Example: two adults, and a child who is 8"
            />
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {COMMON_ALLERGIES.map((allergy) => (
                  <Chip
                    key={allergy}
                    label={allergy}
                    selected={draft.allergies.includes(allergy)}
                    onClick={() => setDraft((current) => ({ ...current, allergies: toggleValue(current.allergies, allergy) }))}
                  />
                ))}
              </div>
              <TextArea
                rows={2}
                value={otherAllergy}
                onChange={(event) => setOtherAllergy(event.target.value)}
                placeholder="Other allergies, separated by commas"
              />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium text-ink">Diets to follow</p>
                <div className="flex flex-wrap gap-2">
                  {COMMON_DIETARY.map((diet) => (
                    <Chip
                      key={diet}
                      label={diet}
                      selected={draft.dietary.includes(diet)}
                      onClick={() => setDraft((current) => ({ ...current, dietary: toggleValue(current.dietary, diet) }))}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-ink">Cuisines you want more of</p>
                <div className="flex flex-wrap gap-2">
                  {COMMON_CUISINES.map((cuisine) => (
                    <Chip
                      key={cuisine}
                      label={cuisine}
                      selected={draft.cuisines.includes(cuisine)}
                      onClick={() => setDraft((current) => ({ ...current, cuisines: toggleValue(current.cuisines, cuisine) }))}
                    />
                  ))}
                </div>
              </div>
              <TextArea rows={2} value={likes} onChange={(event) => setLikes(event.target.value)} placeholder="Foods you like, separated by commas" />
              <TextArea
                rows={2}
                value={dislikes}
                onChange={(event) => setDislikes(event.target.value)}
                placeholder="Foods to leave out, separated by commas"
              />
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <TextArea
                rows={2}
                value={lastPlanned}
                onChange={(event) => setLastPlanned(event.target.value)}
                placeholder="Example: last Sunday, or I have not planned in a while"
              />
              <TextArea
                rows={2}
                value={weekFeel}
                onChange={(event) => setWeekFeel(event.target.value)}
                placeholder="Example: lighter lunches and faster dinners"
              />
            </div>
          ) : null}

          <ErrorText>{error}</ErrorText>
          <div className="flex flex-wrap gap-2">
            {step > 0 ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setAnswers((current) => current.slice(0, -1))
                  setStep((value) => value - 1)
                }}
              >
                Back
              </Button>
            ) : null}
            <Button type="button" variant="ghost" disabled={busy} onClick={continueQuestion}>
              Skip this question
            </Button>
            <Button type="button" disabled={busy} onClick={continueQuestion}>
              {busy ? 'Saving…' : step === QUESTIONS.length - 1 ? 'Finish' : 'Continue'}
            </Button>
          </div>
          <p className="text-xs text-muted">You can change all of this anytime under Food Preferences. Later visits do not ask again.</p>
        </div>
      </div>
    </div>
  )
}
