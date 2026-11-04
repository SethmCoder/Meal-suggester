import type { Ingredient, InventoryItem, Meal } from '../data/types'
import { createId } from './id'
import { canonicalUnit, fromBase, ingredientKey, roundQty, toBase } from './ingredients'

export interface DeductedItem {
  name: string
  quantity: number
  unit: string
  inventoryItemId: string | null
  inventoryBefore: number
  inventoryAfter: number
}

/** Export fromBase for consume math — re-export if needed. */
export { fromBase }

/**
 * Deduct a meal's ingredients from inventory quantities.
 * Removes inventory rows that hit zero. Skips ingredients with no matching stock.
 */
export function consumeMealFromInventory(
  meal: Meal,
  inventory: InventoryItem[],
): { inventory: InventoryItem[]; deducted: DeductedItem[] } {
  const next = inventory.map((item) => ({ ...item }))
  const deducted: DeductedItem[] = []

  for (const ingredient of meal.ingredients) {
    const result = deductOne(ingredient, next)
    if (result) deducted.push(result)
  }

  return {
    inventory: next.filter((item) => item.quantity > 1e-6),
    deducted,
  }
}

function deductOne(ingredient: Ingredient, inventory: InventoryItem[]): DeductedItem | null {
  const key = ingredientKey(ingredient.name)
  if (!key) return null
  const matches = inventory
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => ingredientKey(item.name) === key)
  if (!matches.length) return null

  const needQty = ingredient.quantity != null && ingredient.quantity > 0 ? ingredient.quantity : 1
  const needUnit = canonicalUnit(ingredient.unit) ?? canonicalUnit(matches[0].item.unit) ?? matches[0].item.unit
  const needBase = toBase(needQty, needUnit)

  // Prefer compatible unit family; otherwise subtract raw quantity from first match.
  if (!needBase) {
    const { item, index } = matches[0]
    const before = item.quantity
    const after = roundQty(Math.max(0, before - needQty))
    inventory[index] = { ...item, quantity: after }
    return {
      name: item.name,
      quantity: roundQty(before - after),
      unit: item.unit,
      inventoryItemId: item.id,
      inventoryBefore: before,
      inventoryAfter: after,
    }
  }

  let remaining = needBase.amount
  let totalTaken = 0
  let displayUnit = needUnit
  let primaryId: string | null = null
  let beforePrimary = 0
  let afterPrimary = 0

  for (const { item, index } of matches) {
    if (remaining <= 1e-9) break
    const base = toBase(item.quantity, item.unit)
    if (!base || base.family !== needBase.family) continue
    const take = Math.min(base.amount, remaining)
    const afterBase = base.amount - take
    const afterQty = roundQty(fromBase(afterBase, item.unit))
    if (!primaryId) {
      primaryId = item.id
      beforePrimary = item.quantity
      afterPrimary = afterQty
      displayUnit = item.unit
    }
    inventory[index] = { ...item, quantity: afterQty }
    remaining -= take
    totalTaken += take
  }

  if (totalTaken <= 1e-9) {
    // Unit family mismatch — subtract count-style from first row.
    const { item, index } = matches[0]
    const before = item.quantity
    const after = roundQty(Math.max(0, before - needQty))
    inventory[index] = { ...item, quantity: after }
    return {
      name: item.name,
      quantity: roundQty(before - after),
      unit: item.unit,
      inventoryItemId: item.id,
      inventoryBefore: before,
      inventoryAfter: after,
    }
  }

  return {
    name: ingredient.name,
    quantity: roundQty(fromBase(totalTaken, displayUnit)),
    unit: displayUnit,
    inventoryItemId: primaryId,
    inventoryBefore: beforePrimary,
    inventoryAfter: afterPrimary,
  }
}

export function newConsumptionId() {
  return createId()
}
