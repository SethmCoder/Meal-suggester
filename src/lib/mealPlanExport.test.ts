import { describe, expect, it } from 'vitest'
import type { MealCell } from '../data/types'
import { buildMealPlanPdf, mealPlanText } from './mealPlanExport'

const cells: MealCell[] = [
  {
    day: 'monday',
    slot: 'breakfast',
    meal: {
      id: '1',
      name: 'Scrambled eggs',
      ingredients: [{ name: 'Eggs', quantity: null, unit: null }],
      instructions: [],
      prepMinutes: 5,
      cookMinutes: 5,
      timeIsEstimated: false,
      imageUrl: null,
      sourceName: null,
      sourceUrl: null,
      sourceRetrieved: false,
      sourcePageFetched: false,
      simple: true,
      why: 'Uses the eggs you already have.',
    },
    constraint: null,
  },
]

describe('meal plan export', () => {
  it('writes the meal into the email text and the PDF', () => {
    const text = mealPlanText('2026-11-02', cells)
    expect(text).toContain('Scrambled eggs')
    expect(text).toContain('Eggs')
    const pdf = new TextDecoder().decode(buildMealPlanPdf('2026-11-02', cells))
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain('Scrambled eggs')
    expect(pdf).toContain('%%EOF')
  })
})