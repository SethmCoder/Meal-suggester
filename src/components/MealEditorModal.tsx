import { useState, type FormEvent } from 'react'
import type { Meal } from '../data/types'
import { createId } from '../lib/id'
import { Button, ErrorText, FieldLabel, TextArea, TextInput } from './ui'

interface MealEditorModalProps {
  title: string
  initial?: Meal | null
  onClose: () => void
  onSave: (meal: Meal) => Promise<void>
}

function mealToDraft(meal?: Meal | null) {
  return {
    name: meal?.name ?? '',
    ingredients: meal?.ingredients.map((item) => {
      const qty = item.quantity != null ? String(item.quantity) : ''
      const unit = item.unit ? `${item.unit} ` : ''
      return `${qty}${qty ? ' ' : ''}${unit}${item.name}`.trim()
    }).join('\n') ?? '',
    instructions: meal?.instructions.join('\n') ?? '',
    prepMinutes: meal?.prepMinutes != null ? String(meal.prepMinutes) : '',
    cookMinutes: meal?.cookMinutes != null ? String(meal.cookMinutes) : '',
    imageUrl: meal?.imageUrl ?? '',
    sourceName: meal?.sourceName ?? '',
    sourceUrl: meal?.sourceUrl ?? '',
  }
}

export function MealEditorModal({ title, initial, onClose, onSave }: MealEditorModalProps) {
  const [draft, setDraft] = useState(() => mealToDraft(initial))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('Enter a meal name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const ingredients = draft.ingredients
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const match = line.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.+)$/)
          if (match) {
            return {
              quantity: Number(match[1]),
              unit: match[2] || null,
              name: match[3],
            }
          }
          return { quantity: null, unit: null, name: line }
        })
      const instructions = draft.instructions
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      await onSave({
        id: initial?.id ?? createId(),
        name: draft.name.trim(),
        ingredients,
        instructions,
        prepMinutes: draft.prepMinutes ? Number(draft.prepMinutes) : null,
        cookMinutes: draft.cookMinutes ? Number(draft.cookMinutes) : null,
        timeIsEstimated: Boolean(draft.prepMinutes || draft.cookMinutes) && !(initial && !initial.timeIsEstimated),
        imageUrl: draft.imageUrl.trim() || null,
        sourceName: draft.sourceName.trim() || null,
        sourceUrl: draft.sourceUrl.trim() || null,
        sourceRetrieved: initial?.sourceRetrieved ?? false,
        sourcePageFetched: initial?.sourcePageFetched ?? false,
        why: initial?.why,
        isLeftover: initial?.isLeftover,
        leftoverOf: initial?.leftoverOf,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save meal.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="card-shadow max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div>
            <FieldLabel htmlFor="meal-name">Meal name</FieldLabel>
            <TextInput
              id="meal-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="prep">Prep minutes</FieldLabel>
              <TextInput
                id="prep"
                value={draft.prepMinutes}
                onChange={(e) => setDraft((d) => ({ ...d, prepMinutes: e.target.value }))}
              />
            </div>
            <div>
              <FieldLabel htmlFor="cook">Cook minutes</FieldLabel>
              <TextInput
                id="cook"
                value={draft.cookMinutes}
                onChange={(e) => setDraft((d) => ({ ...d, cookMinutes: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="ingredients">Ingredients (one per line)</FieldLabel>
            <TextArea
              id="ingredients"
              rows={5}
              value={draft.ingredients}
              onChange={(e) => setDraft((d) => ({ ...d, ingredients: e.target.value }))}
              placeholder="2 cup spinach"
            />
          </div>
          <div>
            <FieldLabel htmlFor="instructions">Instructions (one step per line)</FieldLabel>
            <TextArea
              id="instructions"
              rows={5}
              value={draft.instructions}
              onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))}
            />
          </div>
          <div>
            <FieldLabel htmlFor="image-url">Thumbnail image URL</FieldLabel>
            <TextInput
              id="image-url"
              value={draft.imageUrl}
              onChange={(e) => setDraft((d) => ({ ...d, imageUrl: e.target.value }))}
              placeholder="https://…"
            />
          </div>
          <div>
            <FieldLabel htmlFor="source-name">Source name</FieldLabel>
            <TextInput
              id="source-name"
              value={draft.sourceName}
              onChange={(e) => setDraft((d) => ({ ...d, sourceName: e.target.value }))}
            />
          </div>
          <div>
            <FieldLabel htmlFor="source-url">Recipe URL</FieldLabel>
            <TextInput
              id="source-url"
              value={draft.sourceUrl}
              onChange={(e) => setDraft((d) => ({ ...d, sourceUrl: e.target.value }))}
              placeholder="https://…"
            />
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save meal'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
