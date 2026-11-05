import { describe, expect, it } from 'vitest'
import type { Meal } from '../data/types'
import { mealExplanation } from './planner'
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
    expect(next.prepMinutes).toBeNull()
    expect(next.cookMinutes).toBeNull()
  })

  it('does not turn a full recipe that mentions yogurt into a yogurt placeholder', () => {
    const next = simplifyMeal(
      meal({
        name: 'Chicken yogurt stew',
        ingredients: [
          { name: 'Chicken breast', quantity: 500, unit: 'g' },
          { name: 'Yogurt', quantity: 200, unit: 'g' },
        ],
        instructions: ['Brown the chicken.', 'Stir in the yogurt and simmer.'],
      }),
    )
    expect(next.simple).toBeFalsy()
    expect(next.ingredients).toHaveLength(2)
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

  it('explains a simple meal from its ingredient, not from an unrelated request', () => {
    const yogurt = simplifyMeal(
      meal({
        name: 'Yogurt',
        why: 'Matches your request: chicken, chicken breast. Uses 1 ingredient you already have. 6 ingredients still to buy. 30 minutes. Uses 80 more yogurt tub toward a full pack.',
        cookMinutes: 30,
      }),
    )
    expect(mealExplanation(yogurt)).toBe(
      'Yogurt is a simple placeholder for Yogurt. There is no full recipe, and only that ingredient is planned.',
    )
    expect(mealExplanation(yogurt)).not.toMatch(/chicken|full pack|30 minutes/i)
  })
})