import type { MealCell, MealSlot, Weekday, WeekPlan } from '../data/types'
import { MEAL_SLOTS, WEEKDAYS } from '../data/types'

export function emptyWeek(_weekStart: string): MealCell[] {
  return WEEKDAYS.flatMap((day) =>
    MEAL_SLOTS.map((slot) => ({
      day,
      slot,
      meal: null,
      constraint: null,
    })),
  )
}

export function normalizeWeek(weekStart: string, cells: MealCell[] | null | undefined): WeekPlan {
  const base = emptyWeek(weekStart)
  if (!cells?.length) return { weekStart, cells: base }
  return {
    weekStart,
    cells: base.map((cell) => {
      const found = cells.find((item) => item.day === cell.day && item.slot === cell.slot)
      if (!found) return cell
      return {
        ...cell,
        meal: found.meal ?? null,
        constraint: found.constraint ?? null,
      }
    }),
  }
}

export function moveMeal(
  cells: MealCell[],
  from: { day: Weekday; slot: MealSlot },
  to: { day: Weekday; slot: MealSlot },
): MealCell[] {
  if (from.day === to.day && from.slot === to.slot) return cells
  const source = cells.find((cell) => cell.day === from.day && cell.slot === from.slot)
  const target = cells.find((cell) => cell.day === to.day && cell.slot === to.slot)
  if (!source?.meal) return cells
  return cells.map((cell) => {
    if (cell.day === from.day && cell.slot === from.slot) return { ...cell, meal: target?.meal ?? null }
    if (cell.day === to.day && cell.slot === to.slot) return { ...cell, meal: source.meal }
    return cell
  })
}

export function totalMinutes(recipe: { prepMinutes: number | null; cookMinutes: number | null }): number | null {
  if (recipe.prepMinutes == null && recipe.cookMinutes == null) return null
  return (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)
}

export function estimateMinutes(instructions: string[]): { prep: number; cook: number } {
  const words = instructions.join(' ').split(/\s+/).filter(Boolean).length
  const total = Math.min(90, Math.max(15, Math.round(words / 12) || 15))
  const prep = Math.min(20, Math.max(5, Math.round(total * 0.35)))
  return { prep, cook: Math.max(5, total - prep) }
}
