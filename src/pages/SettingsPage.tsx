import { useEffect, useState, type FormEvent } from 'react'
import { Button, ErrorText, FieldLabel, TextInput } from '../components/ui'
import { useSession } from '../context/SessionContext'
import { DEMO_PASSWORD } from '../data/types'

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
    </div>
  )
}
