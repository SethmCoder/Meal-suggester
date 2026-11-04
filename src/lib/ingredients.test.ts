import { describe, expect, it } from 'vitest'
import { parseIngredientLine } from './ingredients'

describe('parseIngredientLine', () => {
  it('parses MealDB glued gram measures like 500g Ricotta', () => {
    expect(parseIngredientLine('500g Ricotta')).toEqual({
      name: 'Ricotta',
      quantity: 500,
      unit: 'g',
    })
    expect(parseIngredientLine('250g Sugar')).toEqual({
      name: 'Sugar',
      quantity: 250,
      unit: 'g',
    })
  })

  it('parses spaced measures and fractions', () => {
    expect(parseIngredientLine('4 large Eggs')).toEqual({
      name: 'large Eggs',
      quantity: 4,
      unit: null,
    })
    expect(parseIngredientLine('1 tsp Cinnamon')).toEqual({
      name: 'Cinnamon',
      quantity: 1,
      unit: 'tsp',
    })
    expect(parseIngredientLine('1/2 cup flour')).toEqual({
      name: 'flour',
      quantity: 0.5,
      unit: 'cup',
    })
    expect(parseIngredientLine('1 1/2 cups milk')).toEqual({
      name: 'milk',
      quantity: 1.5,
      unit: 'cup',
    })
  })

  it('parses number glued to unit without a following space before the name split', () => {
    expect(parseIngredientLine('250ml cream')).toEqual({
      name: 'cream',
      quantity: 250,
      unit: 'ml',
    })
    expect(parseIngredientLine('1/2cup sugar')).toEqual({
      name: 'sugar',
      quantity: 0.5,
      unit: 'cup',
    })
  })

  it('does not invent a quantity when measure is unit-only', () => {
    expect(parseIngredientLine('g Ricotta')).toEqual({
      name: 'Ricotta',
      quantity: null,
      unit: 'g',
    })
  })
})
