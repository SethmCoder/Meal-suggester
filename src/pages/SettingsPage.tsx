import { useEffect, useState, type FormEvent } from 'react'
import { Button, ErrorText, FieldLabel, TextInput } from '../components/ui'
import { useSession } from '../context/SessionContext'
import { DEMO_PASSWORD } from '../data/types'
import { mondayOf } from '../lib/dates'
import { emailWeekPlanEnabled, openMealPlanEmail, setEmailWeekPlanEnabled } from '../lib/mealPlanExport'
import { supabase } from '../lib/supabaseClient'

export function SettingsPage() {
  const { store, profile, mode, setProfile, refreshProfile } = useSession()
  const [username, setUsername] = useState(profile?.username ?? '')
  const [email, setEmail] = useState(profile?.email ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [autoStartTutorial, setAutoStartTutorial] = useState(profile?.autoStartTutorial ?? true)
  const [openOnCurrentWeek, setOpenOnCurrentWeek] = useState(profile?.openOnCurrentWeek ?? true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!profile) return
    setUsername(profile.username)
    setEmail(profile.email)
    setAvatarUrl(profile.avatarUrl ?? '')
    setAutoStartTutorial(profile.autoStartTutorial)
    setOpenOnCurrentWeek(profile.openOnCurrentWeek)
  }, [profile])

  function cancel() {
    if (!profile) return
    setUsername(profile.username)
    setEmail(profile.email)
    setAvatarUrl(profile.avatarUrl ?? '')
    setCurrentPassword('')
    setNewPassword('')
    setAutoStartTutorial(profile.autoStartTutorial)
    setOpenOnCurrentWeek(profile.openOnCurrentWeek)
    setError(null)
    setMessage(null)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!store) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const next = await store.updateProfile({
        username,
        email,
        avatarUrl: avatarUrl.trim() || null,
        autoStartTutorial,
        openOnCurrentWeek,
        ...(newPassword
          ? {
              currentPassword,
              newPassword,
            }
          : {}),
      })
      setProfile(next)
      await refreshProfile()
      setCurrentPassword('')
      setNewPassword('')
      setMessage('Settings saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Settings</h1>
      <p className="mt-1 text-sm text-muted">Manage your Planora account and preferences.</p>

      <form className="soft-shadow mt-6 space-y-4 rounded-2xl border border-line bg-surface p-5" onSubmit={onSubmit}>
        <div>
          <FieldLabel htmlFor="settings-username">Username</FieldLabel>
          <TextInput id="settings-username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="settings-email">Email</FieldLabel>
          <TextInput id="settings-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="settings-avatar">Avatar URL</FieldLabel>
          <TextInput
            id="settings-avatar"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="current-password">Current password</FieldLabel>
            <TextInput
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <TextInput
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>
        {mode === 'demo' ? (
          <p className="text-sm text-muted">Demo password stays {DEMO_PASSWORD} and cannot be changed.</p>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={autoStartTutorial}
            onChange={(e) => setAutoStartTutorial(e.target.checked)}
          />
          Auto-start tutorial for first visits
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={openOnCurrentWeek}
            onChange={(e) => setOpenOnCurrentWeek(e.target.checked)}
          />
          Open planner on the current week
        </label>
        <ErrorText>{error}</ErrorText>
        {message ? <p className="text-sm text-success">{message}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </form>
      <WeeklyPlanEmail />
      <PhoneTexting />
    </div>
  )
}

function WeeklyPlanEmail() {
  const { profile, store } = useSession()
  const [enabled, setEnabled] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    setEnabled(emailWeekPlanEnabled(profile.id))
  }, [profile])

  if (!profile || !store) return null

  return (
    <section className="soft-shadow mt-6 space-y-3 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg font-bold text-ink">Email the weekly plan</h2>
      <p className="text-sm text-muted">
        When this is on, Planora opens an email to {profile.email || 'your account email'} with the current week. Your mail app sends it. No extra email service is required.
      </p>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            const next = event.target.checked
            setError(null)
            setNote(null)
            if (next && !profile.email) {
              setError('Add an email address above before turning this on.')
              return
            }
            setEnabled(next)
            setEmailWeekPlanEnabled(profile.id, next)
            if (!next) {
              setNote('Weekly email is off.')
              return
            }
            void store.getWeek(mondayOf(new Date())).then((week) => {
              openMealPlanEmail({ to: profile.email, weekStart: week.weekStart, cells: week.cells })
              setNote('Your mail app should open with this week’s plan. Use Email this week on Current Meals to send it again.')
            })
          }}
        />
        Email me the meal plan for the week
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {note ? <p className="text-sm text-ink">{note}</p> : null}
    </section>
  )
}

function PhoneTexting() {
  const { mode, profile, refreshProfile } = useSession()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function call(body: { action: 'send' | 'confirm'; phone?: string; code?: string }) {
    const token = (await supabase?.auth.getSession())?.data.session?.access_token
    if (!token) throw new Error('Sign in again to link a phone.')
    const response = await fetch('/api/sms/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = (await response.json()) as { error?: string; phone?: string }
    if (!response.ok) throw new Error(payload.error || 'Could not update texting.')
    return payload
  }

  if (mode !== 'supabase') {
    return (
      <section className="soft-shadow mt-6 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-lg font-bold text-ink">Text Planora</h2>
        <p className="mt-1 text-sm text-muted">
          Texting works on a cloud account. This session stays on this device, so a text cannot reach the list.
        </p>
      </section>
    )
  }

  return (
    <section className="soft-shadow mt-6 space-y-3 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg font-bold text-ink">Text Planora</h2>
      <p className="text-sm text-muted">
        {profile?.phoneVerified && profile.phone
          ? `Texts from ${profile.phone} can add groceries or change a meal. Reply includes the week grid.`
          : 'Verify a mobile number. Then text “add milk” or “different dinner Tuesday”.'}
      </p>
      <div>
        <FieldLabel htmlFor="settings-phone">Mobile number</FieldLabel>
        <TextInput
          id="settings-phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="(415) 555-1212"
          autoComplete="tel"
        />
      </div>
      <Button
        type="button"
        disabled={busy || !phone.trim()}
        onClick={() => {
          setBusy(true)
          setError(null)
          setMessage(null)
          void call({ action: 'send', phone })
            .then((payload) => {
              setSent(true)
              setMessage(`Code sent to ${payload.phone ?? 'your phone'}.`)
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not send the code.'))
            .finally(() => setBusy(false))
        }}
      >
        {busy ? 'Sending…' : 'Text me a code'}
      </Button>
      {sent ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FieldLabel htmlFor="settings-code">Code</FieldLabel>
            <TextInput id="settings-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" />
          </div>
          <Button
            type="button"
            disabled={busy || code.trim().length < 6}
            onClick={() => {
              setBusy(true)
              setError(null)
              void call({ action: 'confirm', code })
                .then(async () => {
                  setMessage('This phone can text Planora.')
                  setCode('')
                  await refreshProfile()
                })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not confirm the code.'))
                .finally(() => setBusy(false))
            }}
          >
            Confirm
          </Button>
        </div>
      ) : null}
      <ErrorText>{error}</ErrorText>
      {message ? <p className="text-sm text-success">{message}</p> : null}
    </section>
  )
}
