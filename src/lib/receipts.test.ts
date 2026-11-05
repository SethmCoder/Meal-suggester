import { describe, expect, it } from 'vitest'
import { selectPreTaxTotal } from './receipts'

describe('selectPreTaxTotal', () => {
  it('prefers an explicit pre-tax subtotal over the grand total', () => {
    expect(
      selectPreTaxTotal({
        subtotalUsd: 102.5,
        taxUsd: 8.2,
        grandTotalUsd: 110.7,
      }),
    ).toBe(102.5)
  })

  it('subtracts tax when only the grand total and tax are visible', () => {
    expect(
      selectPreTaxTotal({
        subtotalUsd: null,
        taxUsd: 8.2,
        grandTotalUsd: 110.7,
      }),
    ).toBe(102.5)
  })

  it('does not store a tax-inclusive total by itself', () => {
    expect(
      selectPreTaxTotal({
        subtotalUsd: null,
        taxUsd: null,
        grandTotalUsd: 110.7,
      }),
    ).toBeNull()
  })

  it('corrects a subtotal that was copied from the tax-inclusive total', () => {
    expect(
      selectPreTaxTotal({
        subtotalUsd: 110.7,
        taxUsd: 8.2,
        grandTotalUsd: 110.7,
      }),
    ).toBe(102.5)
  })

  it('falls back to the sum of line prices', () => {
    expect(
      selectPreTaxTotal({
        subtotalUsd: null,
        taxUsd: null,
        grandTotalUsd: null,
        lineItems: [
          { priceUsd: 4.5 },
          { priceUsd: 6 },
        ],
      }),
    ).toBe(10.5)
  })
})
