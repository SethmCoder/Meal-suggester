import { useEffect, useState } from 'react'
import type { InventoryItem } from '../data/types'
import { foodsToUseFirst, type MustEatFood } from '../lib/mustEat'
import { Button } from './ui'

interface UseUpFoodsProps {
  inventory: InventoryItem[]
  busy: boolean
  note: string | null
  onPlan: (foods: MustEatFood[]) => Promise<void>
}

export function UseUpFoods({ inventory, busy, note, onPlan }: UseUpFoodsProps) {
  const foods = foodsToUseFirst(inventory)
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    setSelected(foods.map((food) => food.id))
  }, [inventory])

  if (!foods.length) return null

  const chosen = foods.filter((food) => selected.includes(food.id))

  return (
    <section className="soft-shadow rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Use this food first</h2>
          <p className="mt-1 text-sm text-muted">
            Freezer items and food that is expiring. Planora searches retrieved recipes that use what you select.
            Instagram does not offer a public recipe search, so these come from TheMealDB and your preferred sites.
          </p>
        </div>
        <Button type="button" disabled={busy || !chosen.length} onClick={() => void onPlan(chosen)}>
          {busy ? 'Finding recipes…' : 'Plan meals around these'}
        </Button>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {foods.map((food) => (
          <li key={food.id}>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-line bg-canvas/50 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(food.id)}
                onChange={() =>
                  setSelected((current) =>
                    current.includes(food.id) ? current.filter((id) => id !== food.id) : [...current, food.id],
                  )
                }
              />
              <span>
                <span className="font-semibold text-ink">{food.name}</span>
                <span className="mt-0.5 block text-xs text-muted">{food.detail}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {note ? <p className="mt-3 text-sm text-ink">{note}</p> : null}
    </section>
  )
}
