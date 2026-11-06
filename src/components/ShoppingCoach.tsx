import { useState, type FormEvent } from 'react'
import { Button, TextArea } from './ui'

interface ShoppingCoachProps {
  busy: boolean
  onAsk: (goal: string) => Promise<string>
}

export function ShoppingCoach({ busy, onAsk }: ShoppingCoachProps) {
  const [goal, setGoal] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const message = goal.trim()
    if (!message || busy) return
    setError(null)
    try {
      const next = await onAsk(message)
      setReply(next)
      setGoal('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not adjust the shopping list.')
    }
  }

  return (
    <section className="soft-shadow rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="text-lg font-bold text-ink">Buy fewer ingredients</h2>
      <p className="mt-1 text-sm text-muted">
        Ask whether a different set of meals could shrink this list. Proposed swaps stay on this page until you apply them.
      </p>
      <form className="mt-3 space-y-3" onSubmit={(event) => void onSubmit(event)}>
        <TextArea
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="Can I drop the specialty items and cook with fewer groceries?"
          rows={3}
        />
        <Button type="submit" disabled={busy || !goal.trim()}>
          {busy ? 'Looking for overlaps…' : 'Ask'}
        </Button>
      </form>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {reply ? <p className="mt-3 text-sm text-ink">{reply}</p> : null}
    </section>
  )
}
