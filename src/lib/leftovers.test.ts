import { describe, expect, it } from 'vitest'
import type { Meal, RetrievedRecipe } from '../data/types'
import { buildShoppingList } from './ingredients'
import { applyLeftoverPlacements, chooseLeftoverLunch, isLeftoverFriendly } from './leftovers'
import { emptyWeek, moveMeal, normalizeWeek } from './meals'
import type { Suggestion } from './planner'

function meal(partial: Partial<Meal> & Pick<Meal, 'id' | 'name'>): Meal {
  return {
    ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
    instructions: ['Boil pasta.'],
    prepMinutes: 10,
    cookMinutes: 20,
    timeIsEstimated: false,
    imageUrl: null,
    sourceName: 'Test Kitchen',
    sourceUrl: 'https://example.com/spaghetti',
    sourceRetrieved: true,
    sourcePageFetched: false,
    ...partial,
  }
}

function recipe(name: string): RetrievedRecipe {
  return {
    providerId: 'test:1',
    name,
    ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
    instructions: ['Boil pasta.'],
    prepMinutes: 10,
    cookMinutes: 20,
    timeIsEstimated: false,
    imageUrl: null,
    sourceName: 'Test Kitchen',
    sourceUrl: 'https://example.com/spaghetti',
    sourcePageFetched: false,
    cuisineHint: 'Italian',
    categoryHint: 'Pasta',
  }
}

describe('isLeftoverFriendly', () => {
  it('detects batch dishes from the name or a pasta ingredient', () => {
    expect(isLeftoverFriendly({ name: 'Spaghetti Bolognese' })).toBe(true)
    expect(isLeftoverFriendly({ name: 'Turkey Chili' })).toBe(true)
    expect(isLeftoverFriendly({ name: 'Chicken Rice Bowl' })).toBe(true)
    expect(isLeftoverFriendly({ name: 'Tuesday bake', ingredients: [{ name: 'Spaghetti' }] })).toBe(true)
    expect(isLeftoverFriendly({ name: 'Green salad', ingredients: [{ name: 'Lettuce' }] })).toBe(false)
    expect(isLeftoverFriendly({ name: 'Spiced chicken', ingredients: [{ name: 'Chili powder' }] })).toBe(false)
  })
})

describe('chooseLeftoverLunch', () => {
  const blank = emptyWeek('2026-11-02')

  it('prefers the next day’s lunch when that slot is open', () => {
    expect(
      chooseLeftoverLunch({
        dinnerDay: 'monday',
        cells: blank,
        targets: [
          { day: 'monday', slot: 'dinner' },
          { day: 'tuesday', slot: 'lunch' },
        ],
      }),
    ).toBe('tuesday')
  })

  it('uses the next open lunch when the following day is already kept', () => {
    const cells = blank.map((cell) =>
      cell.day === 'tuesday' && cell.slot === 'lunch' ? { ...cell, meal: meal({ id: 'kept', name: 'Sandwich' }) } : cell,
    )
    expect(
      chooseLeftoverLunch({
        dinnerDay: 'monday',
        cells,
        targets: [{ day: 'monday', slot: 'dinner' }],
      }),
    ).toBe('wednesday')
  })

  it('still uses a filled lunch when this plan is filling that slot', () => {
    const cells = blank.map((cell) =>
      cell.day === 'tuesday' && cell.slot === 'lunch' ? { ...cell, meal: meal({ id: 'old', name: 'Soup' }) } : cell,
    )
    expect(
      chooseLeftoverLunch({
        dinnerDay: 'monday',
        cells,
        targets: [
          { day: 'monday', slot: 'dinner' },
          { day: 'tuesday', slot: 'lunch' },
        ],
      }),
    ).toBe('tuesday')
  })

  it('skips a lunch already claimed by an earlier dinner', () => {
    expect(
      chooseLeftoverLunch({
        dinnerDay: 'tuesday',
        cells: blank,
        targets: [{ day: 'tuesday', slot: 'dinner' }],
        claimedLunches: ['wednesday'],
      }),
    ).toBe('thursday')
  })

  it('returns null when no later lunch exists', () => {
    expect(
      chooseLeftoverLunch({
        dinnerDay: 'friday',
        cells: blank,
        targets: [{ day: 'friday', slot: 'dinner' }],
      }),
    ).toBeNull()
  })
})

describe('applyLeftoverPlacements', () => {
  it('labels the next lunch as leftovers and shops the ingredients once', () => {
    const dinner = meal({ id: 'cook-1', name: 'Spaghetti', why: 'Uses pasta you already have.' })
    const lunch = meal({
      id: 'lunch-1',
      name: 'Garden salad',
      ingredients: [{ name: 'Lettuce', quantity: 1, unit: 'piece' }],
    })
    const suggestions: Suggestion[] = [
      {
        day: 'monday',
        slot: 'dinner',
        recipe: recipe('Spaghetti'),
        meal: dinner,
        reasons: ['Uses pasta you already have'],
      },
      {
        day: 'tuesday',
        slot: 'lunch',
        recipe: recipe('Garden salad'),
        meal: lunch,
        reasons: ['Light lunch'],
      },
    ]
    const placed = applyLeftoverPlacements({
      suggestions,
      cells: emptyWeek('2026-11-02'),
      targets: [
        { day: 'monday', slot: 'dinner' },
        { day: 'tuesday', slot: 'lunch' },
      ],
    })
    const leftover = placed.find((item) => item.day === 'tuesday' && item.slot === 'lunch')
    expect(leftover?.meal.name).toBe('Leftover Spaghetti')
    expect(leftover?.meal.isLeftover).toBe(true)
    expect(leftover?.meal.leftoverOf).toBe('cook-1')
    expect(leftover?.meal.why).toMatch(/reuses Monday's dinner/i)
    expect(leftover?.meal.sourceUrl).toBe(dinner.sourceUrl)
    expect(placed.find((item) => item.slot === 'dinner')?.meal.why).toMatch(/leftovers are planned/i)

    const rows = buildShoppingList(
      placed.map((item) => item.meal),
      [],
      [],
    )
    expect(rows.find((row) => row.name === 'Pasta')?.quantity).toBe(200)
    expect(rows.some((row) => row.name === 'Lettuce')).toBe(false)
  })

  it('leaves a small dinner alone', () => {
    const suggestions: Suggestion[] = [
      {
        day: 'monday',
        slot: 'dinner',
        recipe: recipe('Green salad'),
        meal: meal({
          id: 'salad',
          name: 'Green salad',
          ingredients: [{ name: 'Lettuce', quantity: 1, unit: 'piece' }],
        }),
        reasons: ['Light dinner'],
      },
    ]
    const placed = applyLeftoverPlacements({
      suggestions,
      cells: emptyWeek('2026-11-02'),
      targets: [{ day: 'monday', slot: 'dinner' }],
    })
    expect(placed).toHaveLength(1)
    expect(placed[0].meal.isLeftover).toBeUndefined()
  })
})

describe('leftover persistence', () => {
  it('keeps leftover flags and why through normalize and move', () => {
    const cooked = meal({
      id: 'cook-1',
      name: 'Leftover Soup',
      why: 'This reuses Monday’s dinner, Soup.',
      isLeftover: true,
      leftoverOf: 'source-1',
    })
    const plan = normalizeWeek('2026-11-02', [
      {
        day: 'tuesday',
        slot: 'lunch',
        meal: cooked,
        constraint: { maxMinutes: 20, note: 'Kept short from your usual pattern' },
        finished: false,
      },
    ])
    const lunch = plan.cells.find((cell) => cell.day === 'tuesday' && cell.slot === 'lunch')
    expect(lunch?.meal?.why).toMatch(/reuses Monday/)
    expect(lunch?.meal?.leftoverOf).toBe('source-1')
    expect(lunch?.meal?.isLeftover).toBe(true)

    const moved = moveMeal(plan.cells, { day: 'tuesday', slot: 'lunch' }, { day: 'wednesday', slot: 'dinner' })
    const dinner = moved.find((cell) => cell.day === 'wednesday' && cell.slot === 'dinner')
    expect(dinner?.meal?.isLeftover).toBe(true)
    expect(dinner?.meal?.leftoverOf).toBe('source-1')
    expect(dinner?.meal?.why).toBe(cooked.why)
  })
})
