import type { FoodCategory, Ingredient, InventoryItem } from '../data/types'

type Family = 'mass' | 'volume' | 'count'

const UNIT_ALIASES: Record<string, string> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  cup: 'cup',
  cups: 'cup',
  piece: 'piece',
  pieces: 'piece',
  pc: 'piece',
  pcs: 'piece',
  item: 'piece',
  items: 'piece',
  count: 'piece',
}

const TO_BASE: Record<string, { family: Family; factor: number }> = {
  g: { family: 'mass', factor: 1 },
  kg: { family: 'mass', factor: 1000 },
  oz: { family: 'mass', factor: 28.3495 },
  lb: { family: 'mass', factor: 453.592 },
  ml: { family: 'volume', factor: 1 },
  l: { family: 'volume', factor: 1000 },
  tsp: { family: 'volume', factor: 4.92892 },
  tbsp: { family: 'volume', factor: 14.7868 },
  cup: { family: 'volume', factor: 240 },
  piece: { family: 'count', factor: 1 },
}

const FILLER = new Set([
  'fresh',
  'large',
  'small',
  'medium',
  'chopped',
  'diced',
  'minced',
  'ground',
  'boneless',
  'skinless',
  'raw',
  'cooked',
  'of',
  'a',
  'an',
  'the',
  'and',
  'or',
  'to',
  'taste',
  'optional',
  'plain',
  'whole',
  'extra',
  'virgin',
  'organic',
  'clove',
  'cloves',
  'pinch',
  'pinches',
  'can',
  'cans',
  'package',
  'packages',
  'bunch',
  'bunches',
  'slice',
  'slices',
  'leaf',
  'leaves',
  'dried',
  'frozen',
])

const SINGULAR_EXCEPTIONS = new Set(['asparagus', 'couscous', 'molasses', 'hummus'])

const FRACTIONS: Record<string, string> = {
  '½': '1/2',
  '¼': '1/4',
  '¾': '3/4',
  '⅓': '1/3',
  '⅔': '2/3',
}

export function canonicalUnit(unit: string | null | undefined): string | null {
  if (!unit) return null
  // Reject quantity+unit tokens like "500g" — digits belong to the amount, not the unit.
  if (/\d/.test(unit)) return null
  const key = unit.toLowerCase().replace(/[^a-z]/g, '')
  return UNIT_ALIASES[key] ?? null
}

function singular(word: string): string {
  if (SINGULAR_EXCEPTIONS.has(word)) return word
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`
  if (/(?:oes|ses|xes|zes|ches|shes)$/.test(word) && word.length > 4) {
    if (word.endsWith('oes')) return word.slice(0, -2)
    return word.slice(0, -2)
  }
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1)
  return word
}

export function ingredientKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .map(singular)
    .filter((word) => word && !FILLER.has(word))
    .join(' ')
}

export function roundQty(value: number): number {
  return Math.round(value * 100) / 100
}

export function toBase(quantity: number, unit: string): { family: Family; amount: number } | null {
  const canon = canonicalUnit(unit)
  if (!canon) return null
  const spec = TO_BASE[canon]
  return { family: spec.family, amount: quantity * spec.factor }
}

export function fromBase(amount: number, unit: string): number {
  const canon = canonicalUnit(unit)
  if (!canon) return amount
  return amount / TO_BASE[canon].factor
}

export function parseIngredientLine(line: string): Ingredient | null {
  let raw = line.trim()
  if (!raw) return null
  for (const [char, value] of Object.entries(FRACTIONS)) raw = raw.replaceAll(char, ` ${value} `)
  raw = raw.replace(/\s+/g, ' ').trim()

  let amount: number | null = null
  let rest = raw
  // Allow optional whitespace after the amount so MealDB-style "500g Ricotta" and "1/2cup"
  // still yield a numeric quantity (space between number and unit is not required).
  const mixed = raw.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)\s*(.*)$/)
  const fraction = raw.match(/^(\d+)\s*\/\s*(\d+)\s*(.*)$/)
  const number = raw.match(/^(\d+(?:\.\d+)?)\s*(.*)$/)
  if (mixed && mixed[4].trim()) {
    amount = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
    rest = mixed[4].trim()
  } else if (fraction && fraction[3].trim()) {
    amount = Number(fraction[1]) / Number(fraction[2])
    rest = fraction[3].trim()
  } else if (number && number[2].trim()) {
    amount = Number(number[1])
    rest = number[2].trim()
  }

  const tokens = rest.split(/\s+/).filter(Boolean)
  let unit: string | null = null
  if (tokens.length > 1 && canonicalUnit(tokens[0])) {
    unit = canonicalUnit(tokens[0])
    tokens.shift()
  }
  const name = tokens.join(' ').replace(/[,;]+$/g, '').trim()
  if (!name) return null
  return { name, quantity: amount, unit }
}

export interface StockResult {
  status: 'have' | 'partial' | 'missing' | 'check'
  need: number | null
  have: number | null
  unit: string | null
  shortfall: number | null
}

export function matchIngredient(ingredient: Ingredient, inventory: InventoryItem[]): StockResult {
  const key = ingredientKey(ingredient.name)
  const rows = key ? inventory.filter((item) => ingredientKey(item.name) === key) : []
  const unit = canonicalUnit(ingredient.unit)
  if (ingredient.quantity == null || ingredient.quantity <= 0) {
    return rows.length
      ? { status: 'have', need: null, have: null, unit, shortfall: null }
      : { status: 'missing', need: null, have: null, unit, shortfall: null }
  }

  const needBase = unit ? toBase(ingredient.quantity, unit) : null
  if (!needBase || !unit) {
    return rows.length
      ? { status: 'check', need: ingredient.quantity, have: null, unit: ingredient.unit, shortfall: null }
      : { status: 'missing', need: ingredient.quantity, have: 0, unit: ingredient.unit, shortfall: ingredient.quantity }
  }

  let haveBase = 0
  let compatible = false
  for (const row of rows) {
    const base = toBase(row.quantity, row.unit)
    if (base && base.family === needBase.family) {
      compatible = true
      haveBase += base.amount
    }
  }

  if (!compatible) {
    return rows.length
      ? { status: 'check', need: ingredient.quantity, have: null, unit, shortfall: null }
      : { status: 'missing', need: ingredient.quantity, have: 0, unit, shortfall: ingredient.quantity }
  }

  const have = roundQty(fromBase(haveBase, unit))
  if (haveBase + 1e-6 >= needBase.amount) {
    return { status: 'have', need: ingredient.quantity, have, unit, shortfall: 0 }
  }
  return {
    status: 'partial',
    need: ingredient.quantity,
    have,
    unit,
    shortfall: roundQty(fromBase(needBase.amount - haveBase, unit)),
  }
}

export function summarizeStock(ingredients: Ingredient[], inventory: InventoryItem[]): {
  missingCount: number
  checkCount: number
  label: string
} {
  let missingCount = 0
  let checkCount = 0
  for (const ingredient of ingredients) {
    const result = matchIngredient(ingredient, inventory)
    if (result.status === 'missing' || result.status === 'partial') missingCount += 1
    else if (result.status === 'check') checkCount += 1
  }
  if (ingredients.length === 0) return { missingCount: 0, checkCount: 0, label: 'No ingredients listed' }
  if (missingCount === 0 && checkCount === 0) return { missingCount: 0, checkCount: 0, label: 'In inventory' }
  if (missingCount === 0) return { missingCount: 0, checkCount, label: `Check ${checkCount}` }
  return { missingCount, checkCount, label: `Buy ${missingCount}` }
}

export interface ShoppingRow {
  key: string
  name: string
  quantity: number | null
  unit: string | null
  status: 'missing' | 'check' | 'purchased'
  haveQuantity: number | null
  mealNames: string[]
}

interface ShoppingGroup {
  key: string
  name: string
  mealNames: Set<string>
  family: Family | null
  needBase: number
  shortBase: number
  displayUnit: string | null
  sawNumeric: boolean
  sawCheck: boolean
  sawGap: boolean
  allCovered: boolean
}

export function buildShoppingList(
  meals: { name: string; ingredients: Ingredient[] }[],
  inventory: InventoryItem[],
  purchasedKeys: string[],
): ShoppingRow[] {
  const purchased = new Set(purchasedKeys)
  const groups = new Map<string, ShoppingGroup>()

  for (const meal of meals) {
    for (const ingredient of meal.ingredients) {
      const key = ingredientKey(ingredient.name)
      if (!key) continue
      const match = matchIngredient(ingredient, inventory)
      const group = groups.get(key) ?? {
        key,
        name: ingredient.name.trim(),
        mealNames: new Set<string>(),
        family: null,
        needBase: 0,
        shortBase: 0,
        displayUnit: null,
        sawNumeric: false,
        sawCheck: false,
        sawGap: false,
        allCovered: true,
      }
      group.mealNames.add(meal.name)
      if (match.status !== 'have') group.allCovered = false
      if (match.status === 'check') group.sawCheck = true
      if (match.status === 'missing' || match.status === 'partial') group.sawGap = true

      const unit = canonicalUnit(ingredient.unit)
      const base = ingredient.quantity != null && unit ? toBase(ingredient.quantity, unit) : null
      if (base && unit) {
        if (group.family && group.family !== base.family) {
          group.sawCheck = true
        } else {
          group.family = base.family
          group.needBase += base.amount
          group.displayUnit = group.displayUnit ?? unit
          group.sawNumeric = true
          if (match.shortfall != null && match.shortfall > 0) {
            group.shortBase += toBase(match.shortfall, unit)?.amount ?? 0
          } else if (match.status === 'missing') {
            group.shortBase += base.amount
          }
        }
      }
      groups.set(key, group)
    }
  }

  const rows: ShoppingRow[] = []
  for (const group of groups.values()) {
    const mealNames = [...group.mealNames]
    const unit = group.displayUnit
    const needQty = group.sawNumeric && unit ? roundQty(fromBase(group.needBase, unit)) : null
    const shortQty = group.sawNumeric && unit ? roundQty(fromBase(group.shortBase, unit)) : null
    const haveQty =
      needQty != null && shortQty != null ? roundQty(Math.max(0, needQty - shortQty)) : null

    if (group.allCovered) {
      if (!purchased.has(group.key)) continue
      rows.push({
        key: group.key,
        name: group.name,
        quantity: needQty,
        unit,
        status: 'purchased',
        haveQuantity: haveQty,
        mealNames,
      })
      continue
    }

    if (group.sawGap && shortQty != null && shortQty > 0) {
      rows.push({
        key: group.key,
        name: group.name,
        quantity: shortQty,
        unit,
        status: 'missing',
        haveQuantity: haveQty,
        mealNames,
      })
      continue
    }

    if (group.sawCheck) {
      rows.push({
        key: group.key,
        name: group.name,
        quantity: needQty,
        unit,
        status: 'check',
        haveQuantity: null,
        mealNames,
      })
      continue
    }

    rows.push({
      key: group.key,
      name: group.name,
      quantity: null,
      unit: null,
      status: 'missing',
      haveQuantity: null,
      mealNames,
    })
  }

  return rows.sort((a, b) => {
    const rank = (status: ShoppingRow['status']) => (status === 'purchased' ? 1 : 0)
    return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name)
  })
}

export function formatQuantity(value: number | null, unit: string | null): string {
  if (value == null) return ''
  const rounded = roundQty(value)
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded)
  return unit ? `${text} ${unit}` : text
}

export function guessCategory(name: string): FoodCategory {
  const key = ingredientKey(name)
  const has = (...words: string[]) => words.some((word) => key.split(' ').includes(word) || key.includes(word))
  if (name.toLowerCase().includes('frozen')) return 'frozen'
  if (has('chicken', 'beef', 'pork', 'turkey', 'fish', 'salmon', 'shrimp', 'bacon', 'sausage', 'lamb')) return 'meat'
  if (has('milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'egg')) return 'dairy'
  if (has('apple', 'banana', 'spinach', 'lettuce', 'tomato', 'onion', 'garlic', 'pepper', 'carrot', 'broccoli', 'potato', 'lemon', 'lime', 'avocado', 'herb')) {
    return 'produce'
  }
  if (has('rice', 'pasta', 'flour', 'bean', 'oil', 'salt', 'sugar', 'oat', 'bread', 'sauce', 'spice')) return 'pantry'
  return 'other'
}
