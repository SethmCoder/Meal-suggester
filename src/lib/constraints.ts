import type { MealCell, MealSlot, TimeConstraint, Weekday } from '../data/types'
import { MEAL_SLOTS, WEEKDAYS } from '../data/types'

function dayPattern(): RegExp {
  return /\b(monday|tuesday|wednesday|thursday|friday|mon|tues|tue|wed|thur|thurs|thu|fri)\b/g
}

const DAY_MAP: Record<string, Weekday> = {
  monday: 'monday',
  mon: 'monday',
  tuesday: 'tuesday',
  tue: 'tuesday',
  tues: 'tuesday',
  wednesday: 'wednesday',
  wed: 'wednesday',
  thursday: 'thursday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  friday: 'friday',
  fri: 'friday',
}

const STOPWORDS = new Set([
  'under',
  'less',
  'than',
  'at',
  'most',
  'maximum',
  'max',
  'within',
  'no',
  'more',
  'minutes',
  'minute',
  'mins',
  'min',
  'must',
  'take',
  'plan',
  'my',
  'the',
  'week',
  'entire',
  'whole',
  'full',
  'this',
  'using',
  'use',
  'what',
  'i',
  'have',
  'already',
  'inventory',
  'please',
  'for',
  'a',
  'an',
  'and',
  'with',
  'something',
  'quick',
  'from',
  'on',
  'hand',
  'up',
  'make',
  'so',
  'it',
  'is',
  'are',
  'be',
  'some',
  'type',
  'kind',
  'like',
  'etc',
  'ie',
  'eg',
  'or',
  'to',
  'of',
  'any',
  'all',
  'meals',
  'meal',
  'food',
  'recipe',
  'recipes',
  'based',
  'about',
  'around',
  'maybe',
  'just',
  'only',
  'also',
  'can',
  'could',
  'would',
  'should',
  'want',
  'needs',
  'need',
  'slot',
  'slots',
])

/** Keep culinary intent words that stopword stripping might otherwise bury. */
const FOOD_HINTS = [
  'egg',
  'eggs',
  'scrambled',
  'fried',
  'omelette',
  'omelet',
  'poached',
  'boiled',
  'breakfast',
  'pancake',
  'pancakes',
  'waffle',
  'toast',
  'oatmeal',
  'yogurt',
  'chicken',
  'beef',
  'pork',
  'fish',
  'salmon',
  'shrimp',
  'tofu',
  'pasta',
  'rice',
  'noodle',
  'soup',
  'salad',
  'taco',
  'tacos',
  'curry',
  'stir',
  'fry',
  'bowl',
  'sandwich',
  'burger',
  'pizza',
  'italian',
  'mexican',
  'chinese',
  'japanese',
  'indian',
  'thai',
  'korean',
  'mediterranean',
  'vegetarian',
  'vegan',
]

export interface PlanRequest {
  days: Weekday[]
  slots: MealSlot[]
  maxMinutes: number | null
  wantWeek: boolean
  preferInventory: boolean
  queryText: string
  /** Explicit food/cuisine intents from the user message. */
  foodFocus: string[]
}

export function parsePlanRequest(message: string): PlanRequest {
  const lower = message.toLowerCase()
  const days = new Set<Weekday>()
  for (const match of lower.matchAll(dayPattern())) {
    const day = DAY_MAP[match[1] ?? '']
    if (day) days.add(day)
  }

  const slots = new Set<MealSlot>()
  if (/\bbreakfasts?\b/.test(lower)) slots.add('breakfast')
  if (/\blunches?\b/.test(lower)) slots.add('lunch')
  if (/\bdinners?\b/.test(lower)) slots.add('dinner')

  const explicit = lower.match(
    /(?:under|less than|at most|no more than|max(?:imum)?|within)\s+(\d+)\s*(?:min|mins|minutes)?/,
  )
  const loose = lower.match(/(\d+)\s*(?:min|mins|minutes)\b/)
  const maxMinutes = explicit ? Number(explicit[1]) : loose ? Number(loose[1]) : null

  const wantWeek = /\b(whole week|entire week|full week|plan (?:my |the )?week|this week)\b/.test(lower)
  const preferInventory = /\b(inventory|what i have|already have|use up|on hand|expir\w*|freezer|frozen|have to eat)\b/.test(lower)

  const foodFocus = FOOD_HINTS.filter((hint) => new RegExp(`\\b${hint}\\b`, 'i').test(lower))

  let query = lower
  query = query.replace(dayPattern(), ' ')
  query = query.replace(/\b(breakfasts?|lunches?|dinners?|meals?)\b/g, ' ')
  query = query.replace(/\d+/g, ' ')
  query = query.replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const queryWords = query
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))

  return {
    days: WEEKDAYS.filter((day) => days.has(day)),
    slots: MEAL_SLOTS.filter((slot) => slots.has(slot)),
    maxMinutes: maxMinutes != null && Number.isFinite(maxMinutes) ? maxMinutes : null,
    wantWeek,
    preferInventory,
    queryText: [...new Set([...foodFocus, ...queryWords])].join(' '),
    foodFocus: [...new Set(foodFocus)],
  }
}

export function targetCells(request: PlanRequest, cells: MealCell[]): MealCell[] {
  let pool = cells
  if (request.days.length) pool = pool.filter((cell) => request.days.includes(cell.day))
  if (request.slots.length) pool = pool.filter((cell) => request.slots.includes(cell.slot))
  if (!request.wantWeek && request.days.length === 0 && request.slots.length === 0) {
    const empty = pool.filter((cell) => !cell.meal)
    return empty.length ? empty : pool
  }
  if (request.wantWeek && request.days.length === 0 && request.slots.length === 0) return cells
  return pool
}

export function constraintUpdates(
  message: string,
  request: PlanRequest,
  targets: MealCell[],
): { day: Weekday; slot: MealSlot; constraint: TimeConstraint }[] {
  if (request.maxMinutes == null) return []
  return targets.map((cell) => {
    const previous = cell.constraint?.maxMinutes
    const maxMinutes =
      previous != null ? Math.min(previous, request.maxMinutes as number) : (request.maxMinutes as number)
    return {
      day: cell.day,
      slot: cell.slot,
      constraint: { maxMinutes, note: message.trim() },
    }
  })
}
