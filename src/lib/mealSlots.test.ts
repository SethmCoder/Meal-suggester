import { describe, expect, it } from 'vitest'
import type { RetrievedRecipe } from '../data/types'
import { breakfastLike, dessertLike, fitsMealSlot } from './mealSlots'

function recipe(partial: Partial<RetrievedRecipe> & Pick<RetrievedRecipe, 'name'>): RetrievedRecipe {
  return {
    providerId: 'test:1',
    ingredients: [],
    instructions: [],
    prepMinutes: null,
    cookMinutes: null,
    timeIsEstimated: true,
    imageUrl: null,
    sourceName: 'Test',
    sourceUrl: null,
    sourcePageFetched: false,
    cuisineHint: null,
    categoryHint: null,
    ...partial,
  }
}

describe('mealSlots', () => {
  it('rejects desserts for meal slots', () => {
    const cake = recipe({ name: 'Chocolate Cake', categoryHint: 'Dessert' })
    expect(dessertLike(cake)).toBe(true)
    expect(fitsMealSlot(cake, 'breakfast')).toBe(false)
    expect(fitsMealSlot(cake, 'dinner')).toBe(false)
  })

  it('recognizes breakfast dishes', () => {
    const eggs = recipe({ name: 'Scrambled Eggs', categoryHint: 'Breakfast' })
    expect(breakfastLike(eggs)).toBe(true)
    expect(fitsMealSlot(eggs, 'breakfast')).toBe(true)
  })
})
