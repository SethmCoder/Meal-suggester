import type { InventoryItem, Meal, Preferences } from '../data/types'
import { aiConfigured, suggestRunningLowWithModel } from './ai'
import { ingredientKey } from './ingredients'

export interface RunningLowItem {
  key: string
  name: string
  reason: string
  source: 'heuristic' | 'ai'
  quantity: number | null
  unit: string | null
}

/** Pantry/fridge staples people often run low on. */
export const COMMON_STAPLES = [
  'soy sauce',
  'olive oil',
  'vegetable oil',
  'sesame oil',
  'salt',
  'black pepper',
  'garlic',
  'onion',
  'butter',
  'eggs',
  'milk',
  'rice',
  'pasta',
  'flour',
  'sugar',
  'honey',
  'vinegar',
  'rice vinegar',
  'ketchup',
  'mayonnaise',
  'mustard',
  'hot sauce',
  'broth',
  'chicken broth',
  'stock',
  'tomato paste',
  'canned tomatoes',
  'beans',
  'lentils',
  'oats',
  'bread',
  'tortillas',
  'cheese',
  'yogurt',
  'lemon',
  'lime',
  'ginger',
  'cumin',
  'paprika',
  'chili flakes',
  'baking powder',
  'baking soda',
  'cornstarch',
] as const

function isLowQuantity(item: InventoryItem): boolean {
  const unit = item.unit.toLowerCase()
  const qty = item.quantity
  if (!Number.isFinite(qty)) return false
  if (['piece', 'pieces', 'pc', 'count', 'item', 'items', 'clove', 'cloves'].includes(unit)) return qty <= 2
  if (['tsp', 'teaspoon', 'teaspoons'].includes(unit)) return qty <= 3
  if (['tbsp', 'tablespoon', 'tablespoons'].includes(unit)) return qty <= 2
  if (['cup', 'cups', 'ml'].includes(unit)) return qty <= 0.5 || (unit === 'ml' && qty <= 100)
  if (['g', 'gram', 'grams', 'oz'].includes(unit)) return qty <= 50 || (unit.includes('oz') && qty <= 2)
  if (['l', 'liter', 'litre', 'kg'].includes(unit)) return qty <= 0.25
  return qty <= 1
}

function usageCounts(meals: Meal[]): Map<string, { name: string; count: number }> {
  const counts = new Map<string, { name: string; count: number }>()
  for (const meal of meals) {
    const seen = new Set<string>()
    for (const ingredient of meal.ingredients) {
      const key = ingredientKey(ingredient.name)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const current = counts.get(key)
      if (current) current.count += 1
      else counts.set(key, { name: ingredient.name.trim(), count: 1 })
    }
  }
  return counts
}

function looksLikeStaple(name: string): boolean {
  const key = ingredientKey(name)
  return COMMON_STAPLES.some((staple) => key.includes(ingredientKey(staple)) || ingredientKey(staple).includes(key))
}

/** Local heuristics: low inventory stock + frequently used staples. */
export function detectRunningLow(meals: Meal[], inventory: InventoryItem[]): RunningLowItem[] {
  const byKey = new Map(inventory.map((item) => [ingredientKey(item.name), item]))
  const usage = usageCounts(meals)
  const items: RunningLowItem[] = []
  const seen = new Set<string>()

  for (const item of inventory) {
    const key = ingredientKey(item.name)
    if (!key || seen.has(key) || !isLowQuantity(item)) continue
    if (!looksLikeStaple(item.name) && (usage.get(key)?.count ?? 0) < 2) continue
    seen.add(key)
    const uses = usage.get(key)?.count ?? 0
    items.push({
      key,
      name: item.name,
      reason:
        uses > 0
          ? `Only ${item.quantity} ${item.unit} left and used in ${uses} meal${uses === 1 ? '' : 's'} this week`
          : `Only ${item.quantity} ${item.unit} left in inventory`,
      source: 'heuristic',
      quantity: item.quantity,
      unit: item.unit,
    })
  }

  for (const [key, info] of usage) {
    if (seen.has(key) || info.count < 2 || !looksLikeStaple(info.name)) continue
    const stock = byKey.get(key)
    if (stock && !isLowQuantity(stock)) continue
    seen.add(key)
    items.push({
      key,
      name: stock?.name ?? info.name,
      reason: stock
        ? `Used in ${info.count} meals and stock is getting low (${stock.quantity} ${stock.unit})`
        : `Used in ${info.count} meals and not clearly stocked as a pantry staple`,
      source: 'heuristic',
      quantity: stock?.quantity ?? null,
      unit: stock?.unit ?? null,
    })
  }

  return items.sort((a, b) => a.name.localeCompare(b.name))
}

function storageKey(weekStart: string, profileId: string) {
  return `planora:running-low:${profileId}:${weekStart}`
}

export function loadDismissedRunningLow(weekStart: string, profileId: string): string[] {
  try {
    const raw = localStorage.getItem(`${storageKey(weekStart, profileId)}:dismissed`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function saveDismissedRunningLow(weekStart: string, profileId: string, keys: string[]) {
  localStorage.setItem(`${storageKey(weekStart, profileId)}:dismissed`, JSON.stringify(keys))
}

export function loadCachedRunningLow(weekStart: string, profileId: string): RunningLowItem[] | null {
  try {
    const raw = localStorage.getItem(storageKey(weekStart, profileId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.filter((item): item is RunningLowItem => Boolean(item && typeof item === 'object' && 'key' in item))
  } catch {
    return null
  }
}

export function saveCachedRunningLow(weekStart: string, profileId: string, items: RunningLowItem[]) {
  localStorage.setItem(storageKey(weekStart, profileId), JSON.stringify(items))
}

export async function refreshRunningLow(input: {
  meals: Meal[]
  inventory: InventoryItem[]
  preferences: Preferences
  weekStart: string
  profileId: string
  excludeKeys?: string[]
}): Promise<{ items: RunningLowItem[]; reply: string }> {
  const dismissed = new Set(loadDismissedRunningLow(input.weekStart, input.profileId))
  const excluded = new Set(input.excludeKeys ?? [])
  const heuristic = detectRunningLow(input.meals, input.inventory).filter(
    (item) => !dismissed.has(item.key) && !excluded.has(item.key),
  )

  let aiItems: RunningLowItem[] = []
  let reply = heuristic.length
    ? `Found ${heuristic.length} staple${heuristic.length === 1 ? '' : 's'} that look low.`
    : 'No obvious running-low staples from inventory heuristics.'

  if (aiConfigured()) {
    const suggested = await suggestRunningLowWithModel({
      inventory: input.inventory.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
      })),
      mealIngredients: [...usageCounts(input.meals).entries()].map(([key, info]) => ({
        key,
        name: info.name,
        mealCount: info.count,
      })),
      staples: [...COMMON_STAPLES],
      allergies: input.preferences.allergies,
      dietary: input.preferences.dietary,
    })
    if (suggested) {
      aiItems = suggested.items
        .map((item) => ({
          key: ingredientKey(item.name),
          name: item.name.trim(),
          reason: item.reason.trim() || 'Common staple that may be running low',
          source: 'ai' as const,
          quantity: null,
          unit: null,
        }))
        .filter((item) => item.key && !dismissed.has(item.key) && !excluded.has(item.key))
      if (suggested.reply) reply = suggested.reply
    }
  }

  const merged = new Map<string, RunningLowItem>()
  for (const item of [...heuristic, ...aiItems]) {
    const existing = merged.get(item.key)
    if (!existing || (existing.source === 'heuristic' && item.source === 'ai')) {
      merged.set(item.key, existing && item.source === 'ai' ? { ...item, quantity: existing.quantity, unit: existing.unit } : item)
    }
  }
  const items = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))
  saveCachedRunningLow(input.weekStart, input.profileId, items)
  return { items, reply }
}
