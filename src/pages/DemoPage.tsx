import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AuthCard } from '../components/AuthCard'
import { Button, ErrorText, FieldLabel, TextInput } from '../components/ui'
import { useSession } from '../context/SessionContext'
import { DEMO_PASSWORD } from '../data/types'

export function DemoPage() {
  const { profile, demoLogin } = useSession()
  const navigate = useNavigate()
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (profile) return <Navigate to="/app" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await demoLogin(password)
      navigate('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard
      footer={
        <p>
          Prefer a real account?{' '}
          <Link className="font-semibold text-primary hover:underline" to="/">
            Sign in
          </Link>
        </p>
      }
    >
      <h1 className="text-xl font-bold text-ink">Demo access</h1>
      <p className="mt-1 text-sm text-muted">
        Explore the full app with temporary sample data. Nothing you do here is saved to Supabase or normal local
        accounts.
      </p>
      <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-ink">
        Demo password: <span className="font-semibold">{DEMO_PASSWORD}</span>
      </div>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div>
          <FieldLabel htmlFor="demo-password">Password</FieldLabel>
          <TextInput
            id="demo-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Entering…' : 'Login'}
        </Button>
      </form>
    </AuthCard>
  )
}
