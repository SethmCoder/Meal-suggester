import { describe, expect, it } from 'vitest'
import { foodsToUseFirst } from './mustEat'
import { median, scoreProductName } from './openPrices'
import type { InventoryItem } from '../data/types'

describe('scoreProductName', () => {
  it('prefers a plain milk match over chocolate', () => {
    expect(scoreProductName('milk', 'Whole milk')).toBeGreaterThan(scoreProductName('milk', 'Milk chocolate bar'))
  })
})

describe('median', () => {
  it('returns the middle price', () => {
    expect(median([1, 3, 2])).toBe(2)
  })
})

describe('foodsToUseFirst', () => {
  it('includes expired and frozen foods', () => {
    const inventory: InventoryItem[] = [
      { id: '1', name: 'Milk', quantity: 1, unit: 'l', expiresOn: '2020-01-01', category: 'dairy' },
      { id: '2', name: 'Peas', quantity: 1, unit: 'g', expiresOn: null, category: 'frozen' },
      { id: '3', name: 'Rice', quantity: 1, unit: 'kg', expiresOn: null, category: 'pantry' },
    ]
    const names = foodsToUseFirst(inventory, '2026-11-04').map((item) => item.name)
    expect(names).toEqual(['Milk', 'Peas'])
  })
})
