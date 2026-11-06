import { MEAL_SLOTS, WEEKDAYS, type MealSlot, type Weekday } from '../data/types'

const KEY_PREFIX = 'planora.ideal.v1.'

const SKIP = new Set([
  'the',
  'and',
  'with',
  'for',
  'meal',
  'meals',
  'lunch',
  'dinner',
  'breakfast',
  'style',
  'homemade',
  'home',
  'made',
])

export type IdealPlan = Record<string, string>

export function idealKey(day: Weekday, slot: MealSlot) {
  return `${day}:${slot}`
}

export function emptyIdealPlan(): IdealPlan {
  const plan: IdealPlan = {}
  for (const day of WEEKDAYS) {
    for (const slot of MEAL_SLOTS) plan[idealKey(day, slot)] = ''
  }
  return plan
}

export function loadIdealPlan(userId: string): IdealPlan {
  const plan = emptyIdealPlan()
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId)
    if (!raw) return plan
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const key of Object.keys(plan)) {
      if (typeof parsed[key] === 'string') plan[key] = parsed[key]
    }
    return plan
  } catch {
    return plan
  }
}

export function saveIdealPlan(userId: string, plan: IdealPlan) {
  const clean = emptyIdealPlan()
  for (const key of Object.keys(clean)) clean[key] = (plan[key] ?? '').trim()
  localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(clean))
}

export function idealWords(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !SKIP.has(word)),
    ),
  ]
}

export function mealMatchesIdeal(name: string, ingredientNames: string[], ideal: string): boolean {
  const terms = idealWords(ideal)
  if (!terms.length) return false
  const hay = `${name} ${ingredientNames.join(' ')}`.toLowerCase()
  return terms.some((term) => hay.includes(term))
}

export function filledIdealMeals(plan: IdealPlan): { day: Weekday; slot: MealSlot; name: string }[] {
  const rows: { day: Weekday; slot: MealSlot; name: string }[] = []
  for (const day of WEEKDAYS) {
    for (const slot of MEAL_SLOTS) {
      const name = plan[idealKey(day, slot)]?.trim()
      if (name) rows.push({ day, slot, name })
    }
  }
  return rows
}
