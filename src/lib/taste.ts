import type { Preferences } from '../data/types'
import { ingredientKey } from './ingredients'

const KEY_PREFIX = 'planora.taste.v1.'

const FILLERS = new Set([
  'salt',
  'pepper',
  'oil',
  'water',
  'sugar',
  'butter',
  'flour',
  'yeast',
  'baking',
  'powder',
  'raising',
  'garlic',
  'onion',
  'sauce',
  'stock',
  'broth',
])

export interface TasteMemory {
  ingredients: Record<string, number>
  cuisines: Record<string, number>
  recentMains: string[]
}

export interface TasteMeal {
  name: string
  ingredients: { name: string }[]
  cuisineHint?: string | null
}

export function emptyTaste(): TasteMemory {
  return { ingredients: {}, cuisines: {}, recentMains: [] }
}

export function loadTaste(userId: string): TasteMemory {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId)
    if (!raw) return emptyTaste()
    const parsed = JSON.parse(raw) as Partial<TasteMemory>
    return {
      ingredients: parsed.ingredients && typeof parsed.ingredients === 'object' ? parsed.ingredients : {},
      cuisines: parsed.cuisines && typeof parsed.cuisines === 'object' ? parsed.cuisines : {},
      recentMains: Array.isArray(parsed.recentMains) ? parsed.recentMains.filter((item) => typeof item === 'string') : [],
    }
  } catch {
    return emptyTaste()
  }
}

export function saveTaste(userId: string, memory: TasteMemory) {
  try {
    localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(memory))
  } catch {
    // The next suggestion still uses the in-memory result for this turn.
  }
}

function isStaple(key: string): boolean {
  if (!key || FILLERS.has(key)) return true
  return key.split(' ').some((word) => FILLERS.has(word))
}

export function notableIngredients(names: string[], limit = 3): string[] {
  const keys: string[] = []
  for (const name of names) {
    const key = ingredientKey(name)
    if (!key || key.length < 3 || isStaple(key)) continue
    if (keys.includes(key)) continue
    keys.push(key)
    if (keys.length >= limit) break
  }
  return keys
}

export function mainTaste(meal: TasteMeal): string {
  return notableIngredients(meal.ingredients.map((item) => item.name), 1)[0] || ingredientKey(meal.name) || meal.name.toLowerCase()
}

export function preferTermsFrom(memory: TasteMemory): string[] {
  const ingredients = Object.entries(memory.ingredients)
    .filter(([, count]) => count >= 1)
    .map(([name]) => name)
  const cuisines = Object.entries(memory.cuisines)
    .filter(([, count]) => count >= 1)
    .map(([name]) => name)
  return [...ingredients, ...cuisines]
}

function titleWord(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function hasTerm(list: string[], value: string): boolean {
  return list.some((item) => item.toLowerCase() === value.toLowerCase())
}

function withoutTerm(list: string[], value: string): string[] {
  return list.filter((item) => item.toLowerCase() !== value.toLowerCase())
}

export function acceptMeal(
  memory: TasteMemory,
  meal: TasteMeal,
  preferences: Preferences,
): { memory: TasteMemory; preferences: Preferences; note: string; changed: boolean } {
  const nextMemory: TasteMemory = {
    ingredients: { ...memory.ingredients },
    cuisines: { ...memory.cuisines },
    recentMains: [],
  }
  let next = preferences
  let changed = false
  const foods = notableIngredients(meal.ingredients.map((item) => item.name))
  const promoted: string[] = []
  for (const food of foods) {
    const count = (nextMemory.ingredients[food] ?? 0) + 1
    nextMemory.ingredients[food] = count
    if (count >= 2 && !hasTerm(next.favorites, food)) {
      next = { ...next, favorites: [...withoutTerm(next.favorites, food), titleWord(food)], disliked: withoutTerm(next.disliked, food) }
      changed = true
      promoted.push(food)
    }
  }
  const cuisine = meal.cuisineHint?.trim()
  if (cuisine) {
    const key = cuisine.toLowerCase()
    const count = (nextMemory.cuisines[key] ?? 0) + 1
    nextMemory.cuisines[key] = count
    if (count >= 2 && !hasTerm(next.cuisines, cuisine)) {
      next = { ...next, cuisines: [...next.cuisines, titleWord(key)] }
      changed = true
      promoted.push(key)
    }
  }
  const lead = promoted[0] || foods[0]
  const note = lead
    ? promoted.length
      ? `I'll remember you like ${lead}.`
      : `I'll lean toward ${lead} next.`
    : "I'll keep meals in this direction."
  return { memory: nextMemory, preferences: next, note, changed }
}

export function noteReject(memory: TasteMemory, main: string): { memory: TasteMemory; question: string | null } {
  const recent = [...memory.recentMains, main].slice(-2)
  if (recent.length === 2 && recent[0] === recent[1]) {
    return {
      memory: { ...memory, recentMains: [] },
      question: `Is it the ${main}, or just this dish?`,
    }
  }
  return { memory: { ...memory, recentMains: recent }, question: null }
}

export interface ReplyReading {
  disliked: string[]
  focus: string[]
  faster: boolean
  maxMinutes: number | null
  note: string
}

function cleanFoodPhrase(value: string): string {
  const trimmed = value
    .replace(/\b(please|thanks|today|instead|meal|meals|dish|food)\b/gi, ' ')
    .replace(/[^a-z\s-]/gi, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 3)
    .join(' ')
  return ingredientKey(trimmed)
}

export function readReply(text: string): ReplyReading {
  const lower = text.toLowerCase()
  const disliked: string[] = []
  const focus: string[] = []
  const dislikeMatch = lower.match(
    /\b(?:no|without|not|don't like|do not like|dont like|leave out|skip|hate|dislike)\s+(?:the\s+)?([a-z][a-z\s-]{1,40})/i,
  )
  if (dislikeMatch?.[1] && !/\b(minute|minutes|mins|more than|faster|quicker)\b/.test(dislikeMatch[1])) {
    const food = cleanFoodPhrase(dislikeMatch[1])
    if (food) disliked.push(food)
  }
  const focusMatch = lower.match(/\b(?:more like|similar to|another|use the|use)\s+(?:the\s+)?([a-z][a-z\s-]{1,40})/i)
  if (focusMatch?.[1]) {
    const food = cleanFoodPhrase(focusMatch[1])
    if (food && !disliked.includes(food)) focus.push(food)
  }
  const explicit = lower.match(/(?:under|less than|at most|no more than|max(?:imum)?|within)\s+(\d+)/)
  const loose = lower.match(/(\d+)\s*(?:min|mins|minutes)\b/)
  const parsed = explicit ? Number(explicit[1]) : loose ? Number(loose[1]) : null
  const faster = /\b(faster|quicker|quickly|less time|shorter|quick)\b/.test(lower)
  const maxMinutes = parsed != null && Number.isFinite(parsed) ? parsed : faster ? 30 : null
  const notes = [
    disliked.length ? `I'll leave ${disliked.join(', ')} out.` : null,
    faster || maxMinutes != null ? "I'll look for something faster." : null,
    focus.length ? `I'll look for something more like ${focus.join(', ')}.` : null,
  ].filter(Boolean)
  return { disliked, focus, faster, maxMinutes, note: notes.join(' ') }
}

export function applyDislikes(preferences: Preferences, foods: string[]): { preferences: Preferences; changed: boolean } {
  let next = preferences
  let changed = false
  for (const food of foods) {
    const label = titleWord(food)
    if (!label || hasTerm(next.disliked, label)) continue
    next = {
      ...next,
      disliked: [...next.disliked, label],
      favorites: withoutTerm(next.favorites, label),
    }
    changed = true
  }
  return { preferences: next, changed }
}

export function interpretClarification(text: string, ingredient: string): 'ingredient' | 'dish' | null {
  const lower = text.toLowerCase()
  if (/just (this|the) dish|this dish|different dish|only this|not the ingredient/.test(lower)) return 'dish'
  if (lower.includes(ingredient.toLowerCase()) || /leave it out|that ingredient|the ingredient/.test(lower)) return 'ingredient'
  return null
}
