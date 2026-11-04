import { useState, type FormEvent } from 'react'
import { MessageCircle, X } from 'lucide-react'
import type { InventoryItem, Meal, MealFeedback, Preferences, WeekPlan } from '../data/types'
import { suggestMeals } from '../lib/suggest'
import type { Suggestion } from '../lib/planner'
import { MealThumb } from './MealCellCard'
import { Badge, Button, TextArea } from './ui'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  suggestions?: Suggestion[]
  mode?: 'ai' | 'match'
}

interface AiChatProps {
  inventory: InventoryItem[]
  preferences: Preferences
  week: WeekPlan
  feedback: MealFeedback[]
  onApplyConstraints: (constraints: Awaited<ReturnType<typeof suggestMeals>>['constraints']) => Promise<void>
  onAccept: (suggestion: Suggestion) => Promise<void>
  onReject: (suggestion: Suggestion) => Promise<void>
  onEditSuggestion: (suggestion: Suggestion) => void
}

export function AiChat({
  inventory,
  preferences,
  week,
  feedback,
  onApplyConstraints,
  onAccept,
  onReject,
  onEditSuggestion,
}: AiChatProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Ask me to fill a meal or the whole week. I use your inventory, allergies, and time limits, and only suggest recipes that were actually retrieved.',
    },
  ])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const message = input.trim()
    if (!message || busy) return
    setInput('')
    setBusy(true)
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: message }])
    try {
      const result = await suggestMeals({ message, inventory, preferences, week, feedback })
      if (result.constraints.length) await onApplyConstraints(result.constraints)
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: result.reply,
          suggestions: result.suggestions,
          mode: result.mode,
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: err instanceof Error ? err.message : 'The assistant could not complete that request.',
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        data-tutorial="assistant"
        onClick={() => setOpen(true)}
        className="soft-shadow fixed bottom-6 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-ink transition hover:brightness-95"
        style={{ right: 'calc(1.5rem + var(--sidebar-offset, 15rem))' }}
        aria-label="Open AI meal assistant"
      >
        <MessageCircle className="h-6 w-6" />
      </button>

      {open ? (
        <div className="soft-shadow fixed bottom-24 z-30 flex h-[min(560px,70vh)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface"
          style={{ right: 'calc(1.5rem + var(--sidebar-offset, 15rem))' }}
        >
          <div className="flex items-center justify-between border-b border-line bg-primary px-4 py-3 text-white">
            <div>
              <p className="font-semibold">Planora assistant</p>
              <p className="text-xs text-white/80">Personalized from inventory & preferences</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-white/15" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === 'user'
                    ? 'ml-8 rounded-2xl bg-primary px-3 py-2 text-sm text-white'
                    : 'mr-4 rounded-2xl bg-canvas px-3 py-2 text-sm text-ink'
                }
              >
                <p>{message.text}</p>
                {message.mode ? (
                  <div className="mt-2">
                    <Badge tone={message.mode === 'ai' ? 'primary' : 'neutral'}>
                      {message.mode === 'ai' ? 'Model ranked retrieved recipes' : 'Local recipe match'}
                    </Badge>
                  </div>
                ) : null}
                {message.suggestions?.length ? (
                  <div className="mt-3 space-y-2">
                    {message.suggestions.map((suggestion) => (
                      <SuggestionCard
                        key={`${suggestion.day}-${suggestion.slot}-${suggestion.meal.id}`}
                        suggestion={suggestion}
                        onAccept={() => onAccept(suggestion)}
                        onReject={() => onReject(suggestion)}
                        onEdit={() => onEditSuggestion(suggestion)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <form className="border-t border-line p-3" onSubmit={onSubmit}>
            <TextArea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Try “Make breakfast egg-based, like scrambled or fried”'
            />
            <Button type="submit" className="mt-2 w-full" disabled={busy}>
              {busy ? 'Planning…' : 'Send'}
            </Button>
          </form>
        </div>
      ) : null}
    </>
  )
}

function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
  onEdit,
}: {
  suggestion: Suggestion
  onAccept: () => void
  onReject: () => void
  onEdit: () => void
}) {
  const meal: Meal = suggestion.meal
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex gap-3">
        <MealThumb meal={meal} size={56} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">
            {suggestion.day} {suggestion.slot}: {meal.name}
          </p>
          <p className="mt-1 text-xs text-muted">{suggestion.reasons.join(' · ')}</p>
          {meal.sourceUrl ? (
            <a
              href={meal.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs font-semibold text-primary hover:underline"
            >
              Open recipe{meal.sourceName ? ` · ${meal.sourceName}` : ''}
            </a>
          ) : meal.sourceName ? (
            <p className="mt-1 text-xs text-muted">Retrieved from {meal.sourceName}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" className="px-3 py-1.5" onClick={onAccept}>
          Accept
        </Button>
        <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={onEdit}>
          Modify
        </Button>
        <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={onReject}>
          Reject
        </Button>
      </div>
    </div>
  )
}
