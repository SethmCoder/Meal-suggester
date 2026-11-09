import { describe, expect, it } from 'vitest'
import type { RetrievedRecipe } from '../data/types'
import { breakfastLike, dessertLike, fitsMealSlot, sweetCourseLike } from './mealSlots'

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

  it('rejects sweet pastries for lunch and dinner after a dessert-style name', () => {
    const pastry = recipe({ name: 'Fruit and Cream Cheese Breakfast Pastries', categoryHint: 'Breakfast' })
    expect(sweetCourseLike(pastry)).toBe(true)
    expect(fitsMealSlot(pastry, 'lunch')).toBe(false)
    expect(fitsMealSlot(pastry, 'dinner')).toBe(false)
    expect(fitsMealSlot(pastry, 'breakfast')).toBe(true)
  })

  it('keeps savory pies as lunch options', () => {
    const pie = recipe({ name: "Shepherd's Pie", categoryHint: 'Beef' })
    expect(dessertLike(pie)).toBe(false)
    expect(sweetCourseLike(pie)).toBe(false)
    expect(fitsMealSlot(pie, 'lunch')).toBe(true)
  })

  it('recognizes breakfast dishes', () => {
    const eggs = recipe({ name: 'Scrambled Eggs', categoryHint: 'Breakfast' })
    expect(breakfastLike(eggs)).toBe(true)
    expect(sweetCourseLike(eggs)).toBe(false)
    expect(fitsMealSlot(eggs, 'breakfast')).toBe(true)
    expect(fitsMealSlot(eggs, 'lunch')).toBe(true)
  })
})
