import type { Ingredient, Meal } from '../data/types'

interface SimpleDish {
  name: string
  ingredient: string
}

const KNOWN: { pattern: RegExp; dish: SimpleDish }[] = [
  { pattern: /\bscrambled eggs?\b/i, dish: { name: 'Scrambled eggs', ingredient: 'Eggs' } },
  { pattern: /\bfried eggs?\b/i, dish: { name: 'Fried eggs', ingredient: 'Eggs' } },
  { pattern: /\b(hard[ -]?boiled|soft[ -]?boiled|boiled|poached) eggs?\b/i, dish: { name: 'Boiled eggs', ingredient: 'Eggs' } },
  { pattern: /^(buttered |plain )?toast$/i, dish: { name: 'Toast', ingredient: 'Bread' } },
  { pattern: /\b(oatmeal|porridge)\b/i, dish: { name: 'Oatmeal', ingredient: 'Oats' } },
  { pattern: /\b(yogurt|yoghurt)\b/i, dish: { name: 'Yogurt', ingredient: 'Yogurt' } },
  { pattern: /\bcereal\b/i, dish: { name: 'Cereal', ingredient: 'Cereal' } },
]

const PANTRY_NOISE = /\b(salt|pepper|oil|butter|water|spray)\b/i

function knownDish(name: string): SimpleDish | null {
  const trimmed = name.trim()
  if (/\bfrench toast\b/i.test(trimmed)) return null
  for (const item of KNOWN) {
    if (item.pattern.test(trimmed)) return item.dish
  }
  return null
}

function mainFoods(ingredients: Ingredient[]): Ingredient[] {
  return ingredients.filter((item) => item.name.trim() && !PANTRY_NOISE.test(item.name))
}

/** One short “put it in the pan and stir” step with a single real ingredient. */
export function isStirOnly(meal: { instructions: string[]; ingredients: Ingredient[] }): boolean {
  if (meal.instructions.length === 0 || meal.instructions.length > 2) return false
  const text = meal.instructions.join(' ').toLowerCase()
  if (!/\b(stir|scrambl|whisk)\b/.test(text)) return false
  if (/\b(bake|boil|simmer|chop|knead|marinate|roast|grill|fry)\b/.test(text) && !/\bscrambled\b/.test(text)) {
    return false
  }
  return mainFoods(meal.ingredients).length === 1
}

function placeholder(meal: Meal, dish: SimpleDish): Meal {
  return {
    ...meal,
    name: dish.name,
    ingredients: [{ name: dish.ingredient, quantity: null, unit: null }],
    instructions: [],
    imageUrl: null,
    sourceName: null,
    sourceUrl: null,
    sourceRetrieved: false,
    sourcePageFetched: false,
    simple: true,
  }
}

/** Turn a one-step dish into an ingredient placeholder. Other meals pass through. */
export function simplifyMeal(meal: Meal): Meal {
  const known = knownDish(meal.name)
  if (known) return placeholder(meal, known)
  if (isStirOnly(meal)) {
    const main = mainFoods(meal.ingredients)[0]
    return placeholder(meal, { name: meal.name.trim(), ingredient: main?.name.trim() || 'Eggs' })
  }
  if (meal.simple) return { ...meal, simple: false }
  return meal
}
