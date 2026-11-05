import { describe, expect, it } from 'vitest'
import { parseSmsCommand, toE164 } from './smsCommands'

describe('parseSmsCommand', () => {
  it('reads an added ingredient with a quantity', () => {
    expect(parseSmsCommand('add 2 lb chicken')).toEqual({
      type: 'add',
      quantity: 2,
      unit: 'lb',
      name: 'Chicken',
    })
  })

  it('reads a meal swap', () => {
    expect(parseSmsCommand('different dinner Tuesday')).toEqual({
      type: 'change',
      day: 'tuesday',
      slot: 'dinner',
    })
  })
})

describe('toE164', () => {
  it('accepts a 10-digit US number', () => {
    expect(toE164('(415) 555-1212')).toBe('+14155551212')
  })
})