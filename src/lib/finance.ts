import type { Ingredient, InventoryItem, Meal } from '../data/types'
import { ingredientKey } from './ingredients'
import { analyzePackageUsage, GROCERY_PACKAGES, matchGroceryPackage } from './packages'

export interface IngredientCostLine {
  key: string
  name: string
  quantity: number | null
  unit: string | null
  estimatedUnitPriceUsd: number | null
  estimatedLineUsd: number | null
  packageName: string | null
  source: 'package' | 'ai' | 'default'
}

export interface MealCostRow {
  mealId: string
  mealName: string
  day?: string
  slot?: string
  estimatedUsd: number
  lines: IngredientCostLine[]
}

export interface WeekFinanceSummary {
  meals: MealCostRow[]
  shoppingPacks: {
    name: string
    packsNeeded: number
    packPriceUsd: number
    totalUsd: number
    leftover: number
    unit: string
    mealNames: string[]
  }[]
  mealTotalUsd: number
  shoppingTotalUsd: number
  notes: string[]
}

/** Fallback per-unit estimates when no package match exists. */
const DEFAULT_UNIT_PRICES: { match: string; price: number; unit: string }[] = [
  { match: 'salt', price: 0.02, unit: 'tsp' },
  { match: 'pepper', price: 0.05, unit: 'tsp' },
  { match: 'sugar', price: 0.02, unit: 'tsp' },
  { match: 'flour', price: 0.01, unit: 'g' },
  { match: 'spinach', price: 0.01, unit: 'g' },
  { match: 'carrot', price: 0.4, unit: 'piece' },
  { match: 'banana', price: 0.35, unit: 'piece' },
  { match: 'apple', price: 0.7, unit: 'piece' },
  { match: 'avocado', price: 1.5, unit: 'piece' },
]

export type PriceOverrideMap = Record<string, { packPriceUsd?: number; unitPriceUsd?: number; label?: string }>

function estimateIngredientLine(
  ingredient: Ingredient,
  overrides: PriceOverrideMap = {},
): IngredientCostLine {
  const key = ingredientKey(ingredient.name)
  const pack = matchGroceryPackage(ingredient.name)
  const override = overrides[key]

  if (pack) {
    const qty = ingredient.quantity ?? 1
    const unitPrice = (override?.packPriceUsd ?? pack.packPriceUsd) / pack.packSize
    return {
      key,
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      estimatedUnitPriceUsd: roundMoney(unitPrice),
      estimatedLineUsd: roundMoney(unitPrice * qty),
      packageName: override?.label ?? pack.name,
      source: override ? 'ai' : 'package',
    }
  }

  const fallback = DEFAULT_UNIT_PRICES.find((item) => key.includes(item.match))
  const unitPrice = override?.unitPriceUsd ?? fallback?.price ?? 0.5
  const qty = ingredient.quantity ?? 1
  return {
    key,
    name: ingredient.name,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    estimatedUnitPriceUsd: roundMoney(unitPrice),
    estimatedLineUsd: roundMoney(unitPrice * qty),
    packageName: override?.label ?? null,
    source: override ? 'ai' : 'default',
  }
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/** Estimate grocery cost for a shopping-list purchase line. */
export function estimatePurchaseCost(
  name: string,
  quantity: number,
  unit: string,
): number | null {
  return estimateIngredientLine({
    name,
    quantity: quantity > 0 ? quantity : 1,
    unit: unit || null,
  }).estimatedLineUsd
}

export function buildWeekFinance(input: {
  meals: { meal: Meal; day?: string; slot?: string }[]
  inventory?: InventoryItem[]
  overrides?: PriceOverrideMap
}): WeekFinanceSummary {
  const mealRows: MealCostRow[] = input.meals.map(({ meal, day, slot }) => {
    const lines = meal.ingredients.map((ingredient) => estimateIngredientLine(ingredient, input.overrides))
    const estimatedUsd = roundMoney(lines.reduce((sum, line) => sum + (line.estimatedLineUsd ?? 0), 0))
    return {
      mealId: meal.id,
      mealName: meal.name,
      day,
      slot,
      estimatedUsd,
      lines,
    }
  })

  const usage = analyzePackageUsage(
    input.meals.map((item) => item.meal),
    input.inventory ?? [],
  )
  const shoppingPacks = usage
    .filter((item) => item.packsNeeded > 0)
    .map((item) => {
      const override = input.overrides?.[ingredientKey(item.pack.matchKeys[0])]
      const packPrice = override?.packPriceUsd ?? item.pack.packPriceUsd
      return {
        name: override?.label ?? item.pack.name,
        packsNeeded: item.packsNeeded,
        packPriceUsd: packPrice,
        totalUsd: roundMoney(item.packsNeeded * packPrice),
        leftover: roundMoney(item.leftover),
        unit: item.unit,
        mealNames: item.mealNames,
      }
    })

  const mealTotalUsd = roundMoney(mealRows.reduce((sum, row) => sum + row.estimatedUsd, 0))
  const shoppingTotalUsd = roundMoney(shoppingPacks.reduce((sum, row) => sum + row.totalUsd, 0))

  const notes = [
    'Prices are estimates for typical US grocery packs — not live Walmart/Whole Foods scrapes.',
    'Shopping total uses whole packages you likely need to buy; meal totals allocate used portions.',
  ]
  const waste = usage.filter((item) => item.leftover >= 1 && item.packsNeeded > 0)
  if (waste.length) {
    notes.push(
      `Package leftovers to use: ${waste
        .slice(0, 3)
        .map((item) => `${item.leftover.toFixed(item.leftover % 1 ? 1 : 0)} ${item.unit} ${item.pack.name}`)
        .join('; ')}.`,
    )
  }

  return { meals: mealRows, shoppingPacks, mealTotalUsd, shoppingTotalUsd, notes }
}

export function packageCatalogForAi() {
  return GROCERY_PACKAGES.map((pack) => ({
    id: pack.id,
    name: pack.name,
    packSize: pack.packSize,
    unit: pack.unit,
    defaultPriceUsd: pack.packPriceUsd,
    matchKeys: pack.matchKeys,
  }))
}
