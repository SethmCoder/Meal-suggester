import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AuthCard } from '../components/AuthCard'
import { Button, ErrorText, FieldLabel, TextInput } from '../components/ui'
import { useSession } from '../context/SessionContext'

export function SignupPage() {
  const { profile, signup } = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (profile) return <Navigate to="/app" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signup({ email, username, password })
      navigate('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard
      footer={
        <p>
          Have an account?{' '}
          <Link className="font-semibold text-primary hover:underline" to="/">
            Sign in here
          </Link>
        </p>
      }
    >
      <h1 className="text-xl font-bold text-ink">Create your account</h1>
      <p className="mt-1 text-sm text-muted">Start tracking food and planning the week.</p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
          />
        </div>
        <div>
          <FieldLabel htmlFor="username">Username</FieldLabel>
          <TextInput
            id="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="planora_chef"
          />
        </div>
        <div>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <TextInput
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Sign Up'}
        </Button>
      </form>
    </AuthCard>
  )
}
