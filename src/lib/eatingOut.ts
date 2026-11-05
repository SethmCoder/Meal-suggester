import type { Meal, MealCell, MealSlot, RetrievedRecipe, Weekday } from '../data/types'
import { createId } from './id'
import type { Suggestion } from './planner'

export const EATING_OUT_WHY =
  'Eating out. Nothing to cook, and nothing from this meal goes on the shopping list.'

export function eatingOutMeal(): Meal {
  return {
    id: createId(),
    name: 'Eating out',
    ingredients: [],
    instructions: [],
    prepMinutes: null,
    cookMinutes: null,
    timeIsEstimated: false,
    imageUrl: null,
    sourceName: null,
    sourceUrl: null,
    sourceRetrieved: false,
    sourcePageFetched: false,
    eatingOut: true,
    why: EATING_OUT_WHY,
  }
}

export function eatingOutSuggestion(day: Weekday, slot: MealSlot): Suggestion {
  const meal = eatingOutMeal()
  const recipe: RetrievedRecipe = {
    providerId: `eating-out-${day}-${slot}`,
    name: 'Eating out',
    ingredients: [],
    instructions: [],
    prepMinutes: null,
    cookMinutes: null,
    timeIsEstimated: false,
    imageUrl: null,
    sourceName: 'Planora',
    sourceUrl: null,
    sourcePageFetched: false,
    cuisineHint: null,
    categoryHint: null,
  }
  return { day, slot, recipe, meal, reasons: [EATING_OUT_WHY] }
}

export function eatingOutSuggestions(cells: Pick<MealCell, 'day' | 'slot'>[]): Suggestion[] {
  return cells.map((cell) => eatingOutSuggestion(cell.day, cell.slot))
}
