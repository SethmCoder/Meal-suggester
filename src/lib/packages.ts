import type { Ingredient, InventoryItem, Meal, RetrievedRecipe } from '../data/types'
import { canonicalUnit, ingredientKey, toBase } from './ingredients'

export interface GroceryPackage {
  id: string
  name: string
  /** Keys that match this package (ingredientKey fragments). */
  matchKeys: string[]
  /** Typical store pack size in display units. */
  packSize: number
  unit: string
  /** Rough US grocery estimate USD per pack. */
  packPriceUsd: number
}

/** Common buy-as packages so leftovers can be planned across meals. */
export const GROCERY_PACKAGES: GroceryPackage[] = [
  { id: 'eggs', name: 'Eggs (dozen)', matchKeys: ['egg'], packSize: 12, unit: 'piece', packPriceUsd: 3.49 },
  { id: 'milk', name: 'Milk (half gallon)', matchKeys: ['milk'], packSize: 1.89, unit: 'l', packPriceUsd: 2.79 },
  { id: 'butter', name: 'Butter (stick pack)', matchKeys: ['butter'], packSize: 450, unit: 'g', packPriceUsd: 4.29 },
  { id: 'chicken', name: 'Chicken breast pack', matchKeys: ['chicken'], packSize: 1, unit: 'kg', packPriceUsd: 7.99 },
  { id: 'rice', name: 'Rice (2 lb bag)', matchKeys: ['rice'], packSize: 900, unit: 'g', packPriceUsd: 2.49 },
  { id: 'pasta', name: 'Pasta box', matchKeys: ['pasta', 'spaghetti', 'penne', 'noodle'], packSize: 450, unit: 'g', packPriceUsd: 1.49 },
  { id: 'onion', name: 'Onions (bag)', matchKeys: ['onion'], packSize: 3, unit: 'piece', packPriceUsd: 2.29 },
  { id: 'garlic', name: 'Garlic (bulb)', matchKeys: ['garlic'], packSize: 1, unit: 'piece', packPriceUsd: 0.79 },
  { id: 'cheese', name: 'Cheese block', matchKeys: ['cheese', 'cheddar', 'mozzarella'], packSize: 227, unit: 'g', packPriceUsd: 3.99 },
  { id: 'yogurt', name: 'Yogurt tub', matchKeys: ['yogurt', 'yoghurt'], packSize: 900, unit: 'g', packPriceUsd: 4.49 },
  { id: 'tofu', name: 'Tofu block', matchKeys: ['tofu'], packSize: 400, unit: 'g', packPriceUsd: 2.49 },
  { id: 'beans', name: 'Canned beans', matchKeys: ['bean', 'black bean', 'kidney', 'chickpea', 'garbanzo'], packSize: 425, unit: 'g', packPriceUsd: 1.19 },
  { id: 'tomato', name: 'Canned tomatoes', matchKeys: ['tomato', 'tomatoes'], packSize: 400, unit: 'g', packPriceUsd: 1.29 },
  { id: 'oil', name: 'Cooking oil', matchKeys: ['olive oil', 'vegetable oil', 'oil'], packSize: 500, unit: 'ml', packPriceUsd: 6.99 },
  { id: 'soy', name: 'Soy sauce bottle', matchKeys: ['soy sauce'], packSize: 296, unit: 'ml', packPriceUsd: 2.99 },
  { id: 'bread', name: 'Bread loaf', matchKeys: ['bread'], packSize: 1, unit: 'piece', packPriceUsd: 2.99 },
  { id: 'potato', name: 'Potatoes (bag)', matchKeys: ['potato'], packSize: 5, unit: 'piece', packPriceUsd: 3.49 },
  { id: 'lemon', name: 'Lemons (bag)', matchKeys: ['lemon'], packSize: 4, unit: 'piece', packPriceUsd: 2.49 },
  { id: 'lime', name: 'Limes (bag)', matchKeys: ['lime'], packSize: 5, unit: 'piece', packPriceUsd: 2.29 },
]

export interface PackageUsage {
  pack: GroceryPackage
  usedAmount: number
  unit: string
  packsNeeded: number
  leftover: number
  wasteRatio: number
  mealNames: string[]
}

function matchPackage(ingredientName: string): GroceryPackage | null {
  const key = ingredientKey(ingredientName)
  if (!key) return null
  // Prefer longer/more specific matches first.
  const ranked = [...GROCERY_PACKAGES].sort((a, b) => b.matchKeys.join().length - a.matchKeys.join().length)
  for (const pack of ranked) {
    if (pack.matchKeys.some((match) => key === match || key.includes(match) || match.includes(key))) {
      return pack
    }
  }
  return null
}

function amountInPackUnit(ingredient: Ingredient, pack: GroceryPackage): number {
  if (ingredient.quantity == null || ingredient.quantity <= 0) return 1
  const fromUnit = canonicalUnit(ingredient.unit) ?? (pack.unit === 'piece' ? 'piece' : null)
  const toUnit = canonicalUnit(pack.unit)
  if (!fromUnit || !toUnit) return ingredient.quantity
  const base = toBase(ingredient.quantity, fromUnit)
  const packBase = toBase(1, toUnit)
  if (!base || !packBase || base.family !== packBase.family) return ingredient.quantity
  return base.amount / packBase.amount
}

export function analyzePackageUsage(meals: Meal[], inventory: InventoryItem[] = []): PackageUsage[] {
  const inventoryByKey = new Map(inventory.map((item) => [ingredientKey(item.name), item]))
  const groups = new Map<string, PackageUsage>()

  for (const meal of meals) {
    for (const ingredient of meal.ingredients) {
      const pack = matchPackage(ingredient.name)
      if (!pack) continue
      const amount = amountInPackUnit(ingredient, pack)
      const current = groups.get(pack.id) ?? {
        pack,
        usedAmount: 0,
        unit: pack.unit,
        packsNeeded: 0,
        leftover: 0,
        wasteRatio: 0,
        mealNames: [],
      }
      current.usedAmount += amount
      if (!current.mealNames.includes(meal.name)) current.mealNames.push(meal.name)
      groups.set(pack.id, current)
    }
  }

  for (const usage of groups.values()) {
    const stock = inventoryByKey.get(ingredientKey(usage.pack.matchKeys[0]))
    let have = 0
    if (stock) {
      const fake: Ingredient = { name: stock.name, quantity: stock.quantity, unit: stock.unit }
      have = amountInPackUnit(fake, usage.pack)
    }
    const need = Math.max(0, usage.usedAmount - have)
    usage.packsNeeded = need <= 0 ? 0 : Math.ceil(need / usage.pack.packSize)
    const capacity = usage.packsNeeded * usage.pack.packSize
    usage.leftover = Math.max(0, capacity - need)
    usage.wasteRatio = capacity > 0 ? usage.leftover / capacity : 0
  }

  return [...groups.values()].sort((a, b) => b.wasteRatio - a.wasteRatio || a.pack.name.localeCompare(b.pack.name))
}

/** Boost recipes that help finish an opened package (e.g. remaining eggs in a dozen). */
export function packageFillBonus(
  recipe: RetrievedRecipe,
  openPackages: { pack: GroceryPackage; leftoverNeed: number }[],
): { delta: number; reason?: string } {
  if (!openPackages.length) return { delta: 0 }
  let delta = 0
  for (const open of openPackages) {
    if (open.leftoverNeed <= 0) continue
    let uses = 0
    for (const ingredient of recipe.ingredients) {
      const pack = matchPackage(ingredient.name)
      if (!pack || pack.id !== open.pack.id) continue
      uses += amountInPackUnit(ingredient, pack)
    }
    if (uses <= 0) continue
    const helpful = Math.min(uses, open.leftoverNeed)
    delta += helpful * 6
  }
  return { delta }
}

/** After current meals, how much of each pack is still unused in the bought pack(s). */
export function openPackageGaps(meals: Meal[], inventory: InventoryItem[] = []) {
  return analyzePackageUsage(meals, inventory)
    .filter((usage) => usage.packsNeeded > 0 && usage.leftover > 0.25)
    .map((usage) => ({
      pack: usage.pack,
      leftoverNeed: usage.leftover,
      usedAmount: usage.usedAmount,
      packsNeeded: usage.packsNeeded,
    }))
}

export function matchGroceryPackage(ingredientName: string): GroceryPackage | null {
  return matchPackage(ingredientName)
}
