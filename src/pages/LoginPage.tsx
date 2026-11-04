import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AuthCard } from '../components/AuthCard'
import { Button, ErrorText, FieldLabel, TextInput } from '../components/ui'
import { useSession } from '../context/SessionContext'

export function LoginPage() {
  const { profile, login } = useSession()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (profile) {
    return <Navigate to={profile.surveyCompleted ? '/app' : '/onboarding'} replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(identifier, password)
      // AppShell redirects to /onboarding when the survey is still incomplete.
      navigate('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard
      footer={
        <p>
          New here?{' '}
          <Link className="font-semibold text-primary hover:underline" to="/signup">
            Create an account
          </Link>
        </p>
      }
    >
      <h1 className="text-xl font-bold text-ink">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Sign in to plan meals and track what you already own.</p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div>
          <FieldLabel htmlFor="identifier">Email or username</FieldLabel>
          <TextInput
            id="identifier"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@email.com"
          />
        </div>
        <div>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <TextInput
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Login'}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => navigate('/signup')} disabled={busy}>
          Create Account
        </Button>
        <Button type="button" variant="secondary" className="w-full" onClick={() => navigate('/demo')} disabled={busy}>
          Demo
        </Button>
      </form>
    </AuthCard>
  )
}
