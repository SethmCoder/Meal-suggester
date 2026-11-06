import { describe, expect, it } from 'vitest'
import { emptyPreferences, type MealCell, type RetrievedRecipe } from '../data/types'
import { idealWords, mealMatchesIdeal } from './idealPlan'
import { selectSuggestions } from './planner'

function recipe(partial: Partial<RetrievedRecipe> & Pick<RetrievedRecipe, 'providerId' | 'name'>): RetrievedRecipe {
  return {
    ingredients: [{ name: partial.name, quantity: 1, unit: 'piece' }],
    instructions: [],
    prepMinutes: 10,
    cookMinutes: 15,
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

describe('ideal meal plan', () => {
  it('keeps the useful words from an example meal', () => {
    expect(idealWords('Home-made salmon tacos')).toEqual(['salmon', 'tacos'])
    expect(mealMatchesIdeal('Grilled Salmon', ['salmon', 'lemon'], 'salmon tacos')).toBe(true)
  })

  it('prefers a retrieved recipe that resembles the ideal slot', () => {
    const result = selectSuggestions({
      recipes: [
        recipe({ providerId: 'beef', name: 'Beef Stew', ingredients: [{ name: 'beef', quantity: 1, unit: 'piece' }] }),
        recipe({
          providerId: 'salmon',
          name: 'Grilled Salmon',
          ingredients: Array.from({ length: 8 }, (_, index) => ({ name: `item ${index}`, quantity: 1, unit: 'piece' })),
        }),
      ],
      targets: [cell('monday', 'dinner')],
      inventory: [],
      preferences: emptyPreferences(),
      feedback: [],
      preferInventory: false,
      allowReuse: false,
      idealByCell: { 'monday:dinner': 'salmon tacos' },
    })
    expect(result.suggestions[0]?.meal.name).toBe('Grilled Salmon')
    expect(result.suggestions[0]?.reasons.some((reason) => reason.includes('salmon tacos'))).toBe(true)
  })
})
