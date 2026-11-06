import { describe, expect, it } from 'vitest'
import { emptyPreferences, type MealCell, type RetrievedRecipe } from '../data/types'
import { selectSuggestions } from './planner'

function recipe(partial: Partial<RetrievedRecipe> & Pick<RetrievedRecipe, 'providerId' | 'name'>): RetrievedRecipe {
  return {
    ingredients: [{ name: partial.name, quantity: 1, unit: 'piece' }],
    instructions: [],
    prepMinutes: 10,
    cookMinutes: 20,
    timeIsEstimated: false,
    imageUrl: null,
    sourceName: 'Test',
    sourceUrl: null,
    sourcePageFetched: false,
    cuisineHint: null,
    categoryHint: null,
    ...partial,
  }
}

function cell(day: MealCell['day'], slot: MealCell['slot']): MealCell {
  return { day, slot, meal: null, finished: false, constraint: null }
}

describe('selectSuggestions distinct meals', () => {
  const lunch = [cell('monday', 'lunch'), cell('tuesday', 'lunch'), cell('wednesday', 'lunch')]

  it('keeps breakfast dishes off lunch when another recipe fits', () => {
    const result = selectSuggestions({
      recipes: [
        recipe({ providerId: 'eggs', name: 'Salmon Eggs Benedict', categoryHint: 'Breakfast' }),
        recipe({ providerId: 'pasta', name: 'Fruit and Cream Cheese Breakfast Pasta', categoryHint: 'Breakfast' }),
        recipe({ providerId: 'salmon', name: 'Grilled Salmon', categoryHint: 'Seafood' }),
        recipe({ providerId: 'beef', name: 'Beef Stew', categoryHint: 'Beef' }),
        recipe({ providerId: 'chicken', name: 'Chicken Rice', categoryHint: 'Chicken' }),
      ],
      targets: lunch,
      inventory: [],
      preferences: emptyPreferences(),
      feedback: [],
      preferInventory: false,
      allowReuse: false,
    })
    expect(result.suggestions).toHaveLength(3)
    expect(result.suggestions.map((item) => item.meal.name)).not.toContain('Salmon Eggs Benedict')
    expect(new Set(result.suggestions.map((item) => item.meal.name)).size).toBe(3)
  })

  it('does not place the same dish name twice while another recipe fits', () => {
    const result = selectSuggestions({
      recipes: [
        recipe({ providerId: 'a', name: 'Grilled Salmon' }),
        recipe({ providerId: 'b', name: 'Grilled Salmon' }),
        recipe({ providerId: 'c', name: 'Beef Stew' }),
      ],
      targets: [cell('monday', 'dinner'), cell('tuesday', 'dinner')],
      inventory: [],
      preferences: emptyPreferences(),
      feedback: [],
      preferInventory: false,
      allowReuse: false,
    })
    expect(result.suggestions.map((item) => item.meal.name).sort()).toEqual(['Beef Stew', 'Grilled Salmon'])
  })

  it('reuses a dish only after distinct recipes run out', () => {
    const result = selectSuggestions({
      recipes: [recipe({ providerId: 'a', name: 'Beef Stew' }), recipe({ providerId: 'b', name: 'Chicken Rice' })],
      targets: lunch,
      inventory: [],
      preferences: emptyPreferences(),
      feedback: [],
      preferInventory: false,
      allowReuse: true,
    })
    expect(result.suggestions).toHaveLength(3)
    expect(result.suggestions.some((item) => item.reasons.some((reason) => /Repeated because fewer unique recipes/.test(reason)))).toBe(true)
  })
})
