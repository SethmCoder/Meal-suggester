import type { Meal, MealCell, MealSlot, Weekday } from '../data/types'
import { WEEKDAY_LABELS, WEEKDAYS } from '../data/types'
import { createId } from './id'
import { joinReasons, type Suggestion } from './planner'

const NAME_TERMS = [
  'pasta',
  'spaghetti',
  'lasagna',
  'lasagne',
  'noodle',
  'stew',
  'curry',
  'casserole',
  'soup',
  'chili',
  'chilli',
  'biryani',
  'risotto',
  'bolognese',
  'ragu',
  'gumbo',
  'jambalaya',
  'fried rice',
  'paella',
  'tagine',
  'macaroni',
  'mac and cheese',
  'goulash',
  'hot pot',
  'hotpot',
  'shepherd',
  'pot pie',
  'potpie',
  'meatloaf',
  'meat loaf',
  'pulled pork',
  'brisket',
  'enchilada',
  'burrito bowl',
  'rice bowl',
  'grain bowl',
  'stir fry',
  'stir-fry',
  'ramen',
  'pho',
  'baked ziti',
  'pot roast',
  'roast',
  'braise',
  'braised',
  'dal',
  'daal',
  'lentil',
]

const INGREDIENT_TERMS = ['pasta', 'spaghetti', 'noodle', 'lasagna', 'lasagne', 'ramen', 'macaroni', 'gnocchi']

function hasTerm(hay: string, term: string): boolean {
  if (term.includes(' ')) return hay.includes(term)
  if (term.length <= 4) return new RegExp(`(?:^|[^a-z])${term}s?(?:[^a-z]|$)`, 'i').test(hay)
  return hay.includes(term)
}

/** Large-batch dishes that usually leave enough for another meal. */
export function isLeftoverFriendly(meal: { name: string; ingredients?: { name: string }[] }): boolean {
  const name = meal.name.toLowerCase()
  if (NAME_TERMS.some((term) => hasTerm(name, term))) return true
  for (const ingredient of meal.ingredients ?? []) {
    const label = ingredient.name.toLowerCase()
    if (/powder|flake|spice|seasoning/.test(label)) continue
    if (INGREDIENT_TERMS.some((term) => hasTerm(label, term))) return true
  }
  return false
}

/**
 * Lunch that should receive leftovers from a dinner.
 * Prefers the next day, then the next lunch that is empty or being filled by this plan.
 */
export function chooseLeftoverLunch(input: {
  dinnerDay: Weekday
  cells: { day: Weekday; slot: MealSlot; meal: unknown | null }[]
  targets: { day: Weekday; slot: MealSlot }[]
  claimedLunches?: Weekday[]
  /** Days already marked eating out, which should stay placeholders. */
  blockedLunches?: Weekday[]
}): Weekday | null {
  const targetDays = new Set(
    input.targets.filter((target) => target.slot === 'lunch').map((target) => target.day),
  )
  const claimed = new Set(input.claimedLunches ?? [])
  const blocked = new Set(input.blockedLunches ?? [])
  const start = WEEKDAYS.indexOf(input.dinnerDay)
  for (let index = start + 1; index < WEEKDAYS.length; index += 1) {
    const day = WEEKDAYS[index]
    if (claimed.has(day) || blocked.has(day)) continue
    const cell = input.cells.find((item) => item.day === day && item.slot === 'lunch')
    const empty = !cell?.meal
    const targeted = targetDays.has(day)
    if (empty || targeted) return day
  }
  return null
}

export function makeLeftoverMeal(source: Meal, sourceDay: Weekday): Meal {
  const original = source.name.replace(/^Leftover\s+/i, '').trim()
  const label = WEEKDAY_LABELS[sourceDay]
  return {
    ...source,
    id: createId(),
    name: `Leftover ${original}`,
    isLeftover: true,
    leftoverOf: source.id,
    why: `This reuses ${label}'s dinner, ${original}. The same batch covers this meal, so you do not cook it again or buy those ingredients a second time.`,
  }
}

/** After dinners are chosen, place a labeled leftover on the next open lunch. */
export function applyLeftoverPlacements(input: {
  suggestions: Suggestion[]
  cells: MealCell[]
  targets: { day: Weekday; slot: MealSlot }[]
}): Suggestion[] {
  const next = input.suggestions.map((suggestion) => ({
    ...suggestion,
    reasons: [...suggestion.reasons],
    meal: { ...suggestion.meal },
  }))
  const claimed: Weekday[] = []
  const dinners = next
    .filter(
      (suggestion) =>
        suggestion.slot === 'dinner' &&
        !suggestion.meal.isLeftover &&
        !suggestion.meal.eatingOut &&
        isLeftoverFriendly(suggestion.meal),
    )
    .sort((a, b) => WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day))

  for (const dinner of dinners) {
    const day = chooseLeftoverLunch({
      dinnerDay: dinner.day,
      cells: input.cells,
      targets: input.targets,
      claimedLunches: claimed,
      blockedLunches: next.filter((suggestion) => suggestion.slot === 'lunch' && suggestion.meal.eatingOut).map((suggestion) => suggestion.day),
    })
    if (!day) continue
    claimed.push(day)
    const meal = makeLeftoverMeal(dinner.meal, dinner.day)
    const dinnerReasons = [
      ...dinner.reasons,
      `This is a large dish, so leftovers are planned for ${WEEKDAY_LABELS[day]} lunch.`,
    ]
    dinner.reasons = dinnerReasons
    dinner.meal = { ...dinner.meal, why: joinReasons(dinnerReasons) }
    const placement: Suggestion = {
      day,
      slot: 'lunch',
      recipe: dinner.recipe,
      meal,
      reasons: [meal.why ?? 'Leftovers from last night’s dinner.'],
    }
    const index = next.findIndex((suggestion) => suggestion.day === day && suggestion.slot === 'lunch')
    if (index >= 0) next[index] = placement
    else next.push(placement)
  }

  return next
}
