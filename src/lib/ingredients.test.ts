import { describe, expect, it } from 'vitest'
import type { InventoryItem } from '../data/types'
import { buildShoppingList, cleanIngredientName, duplicateInventoryIds, ingredientKey, mergeInventoryAdd, parseIngredientLine, usableInventory } from './ingredients'

describe('cleanIngredientName', () => {
  it('drops measure phrases stuck in the name', () => {
    expect(cleanIngredientName('To taste Red Pepper Flakes')).toBe('Red Pepper Flakes')
    expect(ingredientKey('To taste Red Pepper Flakes')).toBe('red pepper flake')
  })

  it('fixes common egg yolk typos and word order', () => {
    expect(cleanIngredientName('Yolkes Egg')).toBe('Egg Yolks')
    expect(ingredientKey('Yolkes Egg')).toBe('egg yolk')
    expect(ingredientKey('Egg Yolks')).toBe('egg yolk')
  })

  it('keeps cleaned names on the shopping list', () => {
    const rows = buildShoppingList(
      [
        {
          name: 'Salmon Eggs Eggs Benedict',
          ingredients: [
            { name: 'To taste Red Pepper Flakes', quantity: null, unit: null },
            { name: 'Yolkes Egg', quantity: 2, unit: 'piece' },
          ],
        },
      ],
      [],
      [],
    )
    expect(rows.map((row) => row.name).sort()).toEqual(['Egg Yolks', 'Red Pepper Flakes'])
  })
})

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

describe('duplicateInventoryIds', () => {
  it('flags items that share a normalized name and leaves unique items alone', () => {
    const ids = duplicateInventoryIds([
      { id: 'a', name: 'Eggs' },
      { id: 'b', name: 'egg' },
      { id: 'c', name: 'Spinach' },
    ])
    expect([...ids].sort()).toEqual(['a', 'b'])
  })
})

function stock(partial: Partial<InventoryItem> & Pick<InventoryItem, 'id' | 'name'>): InventoryItem {
  return {
    quantity: 1,
    unit: 'piece',
    expiresOn: null,
    category: 'other',
    ...partial,
  }
}

describe('usable inventory and merges', () => {
  it('does not treat expired food as something you can skip buying', () => {
    const inventory = [stock({ id: 'milk', name: 'Milk', quantity: 1, unit: 'l', expiresOn: '2020-01-01', category: 'dairy' })]
    expect(usableInventory(inventory, '2026-11-05')).toEqual([])
    const rows = buildShoppingList(
      [{ name: 'Porridge', ingredients: [{ name: 'Milk', quantity: 1, unit: 'l' }] }],
      inventory,
      [],
    )
    expect(rows.map((row) => row.name)).toContain('Milk')
  })

  it('adds quantity onto the same unit instead of creating another row', () => {
    const existing = [stock({ id: 'eggs', name: 'Eggs', quantity: 6, unit: 'piece', category: 'dairy' })]
    const merged = mergeInventoryAdd(existing, stock({ id: 'new', name: 'egg', quantity: 2, unit: 'piece', category: 'dairy' }))
    expect(merged.id).toBe('eggs')
    expect(merged.quantity).toBe(8)
  })
})
