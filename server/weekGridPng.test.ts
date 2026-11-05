import { describe, expect, it } from 'vitest'
import { renderWeekGridPng } from './weekGridPng'

describe('renderWeekGridPng', () => {
  it('returns a PNG of the week grid', () => {
    const png = renderWeekGridPng([{ day: 'tuesday', slot: 'dinner', name: 'Pasta' }])
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.length).toBeGreaterThan(500)
  })
})