import { describe, expect, it } from 'vitest'
import { parsePlanRequest } from './constraints'

describe('parsePlanRequest', () => {
  it('keeps egg breakfast intent', () => {
    const request = parsePlanRequest('Make the breakfast so it is some type of egg, ie scrambled, fried')
    expect(request.slots).toEqual(['breakfast'])
    expect(request.foodFocus).toEqual(expect.arrayContaining(['egg', 'scrambled', 'fried']))
    expect(request.queryText).toMatch(/egg/)
  })

  it('detects whole week without treating theme days as filters when wantWeek', () => {
    const request = parsePlanRequest('Plan the whole week')
    expect(request.wantWeek).toBe(true)
  })
})
