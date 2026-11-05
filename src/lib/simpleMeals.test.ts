import { describe, expect, it } from 'vitest'
import type { Meal } from '../data/types'
import { simplifyMeal } from './simpleMeals'

function meal(partial: Partial<Meal> & Pick<Meal, 'name'>): Meal {
  return {
    id: 'm1',
    ingredients: [{ name: 'Eggs', quantity: 2, unit: 'piece' }, { name: 'Butter', quantity: 1, unit: 'tbsp' }],
    instructions: ['Beat the eggs with milk, salt, and pepper.', 'Cook slowly, folding often, then serve with toast.'],
    prepMinutes: 5,
    cookMinutes: 10,
    timeIsEstimated: false,
    imageUrl: 'https://example.com/eggs.jpg',
    sourceName: 'TheMealDB',
    sourceUrl: 'https://example.com/recipe',
    sourceRetrieved: true,
    sourcePageFetched: false,
    ...partial,
  }
}

describe('simplifyMeal', () => {
  it('collapses scrambled eggs to an eggs placeholder', () => {
    const next = simplifyMeal(meal({ name: 'Scrambled Eggs' }))
    expect(next.simple).toBe(true)
    expect(next.name).toBe('Scrambled eggs')
    expect(next.ingredients).toEqual([{ name: 'Eggs', quantity: null, unit: null }])
    expect(next.instructions).toEqual([])
    expect(next.sourceUrl).toBeNull()
  })

  it('leaves a full pasta recipe intact', () => {
    const original = meal({
      name: 'Spaghetti Bolognese',
      ingredients: [{ name: 'Spaghetti', quantity: 200, unit: 'g' }],
      instructions: ['Boil the pasta.', 'Simmer the sauce.'],
    })
    const next = simplifyMeal(original)
    expect(next.simple).toBeFalsy()
    expect(next.instructions).toEqual(original.instructions)
    expect(next.sourceUrl).toBe(original.sourceUrl)
  })

  it('collapses a one-step stir with a single food', () => {
    const next = simplifyMeal(
      meal({
        name: 'Pan eggs',
        ingredients: [{ name: 'Eggs', quantity: 2, unit: 'piece' }, { name: 'Salt', quantity: 1, unit: 'tsp' }],
        instructions: ['Put the eggs in the pan and stir until set.'],
      }),
    )
    expect(next.simple).toBe(true)
    expect(next.ingredients[0]?.name).toBe('Eggs')
  })
})