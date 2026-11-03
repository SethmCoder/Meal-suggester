import type { RetrievedRecipe } from '../data/types'
import { estimateMinutes } from './meals'
import { parseIngredientLine } from './ingredients'
import { displaySourceName, preferredPublishers, type RecipePublisher } from './recipeSources'

const MEALDB = 'https://www.themealdb.com/api/json/v1/1'
const cache = new Map<string, RetrievedRecipe>()

export class RecipeSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecipeSourceError'
  }
}

type MealDbMeal = {
  idMeal: string
  strMeal: string
  strMealThumb?: string | null
  strInstructions?: string | null
  strSource?: string | null
  strArea?: string | null
} & Record<string, string | null | undefined>

function mapMealDb(meal: MealDbMeal): RetrievedRecipe {
  const ingredients = []
  for (let index = 1; index <= 20; index += 1) {
    const name = meal[`strIngredient${index}`]?.trim()
    if (!name) continue
    const measure = meal[`strMeasure${index}`]?.trim()
    const parsed = measure ? parseIngredientLine(`${measure} ${name}`) : null
    ingredients.push(parsed ?? { name, quantity: null, unit: null })
  }
  const instructions = (meal.strInstructions ?? '')
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\d+[.)]\s*/, '').trim())
    .filter(Boolean)
  const estimate = estimateMinutes(instructions)
  const mealUrl = `https://www.themealdb.com/meal/${meal.idMeal}`
  const listedSource = meal.strSource?.trim() || null
  const sourceUrl = listedSource || mealUrl
  return {
    providerId: `mealdb:${meal.idMeal}`,
    name: meal.strMeal,
    ingredients,
    instructions,
    prepMinutes: estimate.prep,
    cookMinutes: estimate.cook,
    timeIsEstimated: true,
    imageUrl: meal.strMealThumb?.trim() || null,
    sourceName: displaySourceName(listedSource ? 'Original source' : 'TheMealDB', sourceUrl),
    sourceUrl,
    sourcePageFetched: false,
    cuisineHint: meal.strArea?.trim() || null,
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new RecipeSourceError(`Recipe source returned ${response.status}.`)
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof RecipeSourceError) throw error
    throw new RecipeSourceError('Could not reach a recipe source. Check your connection and try again.')
  }
}

async function lookupMealDb(id: string): Promise<RetrievedRecipe | null> {
  const cached = cache.get(`mealdb:${id}`)
  if (cached) return cached
  const payload = await fetchJson<{ meals: MealDbMeal[] | null }>(`${MEALDB}/lookup.php?i=${encodeURIComponent(id)}`)
  const meal = payload.meals?.[0]
  if (!meal) return null
  const recipe = mapMealDb(meal)
  cache.set(recipe.providerId, recipe)
  return recipe
}

async function searchMealDbByName(term: string): Promise<RetrievedRecipe[]> {
  const payload = await fetchJson<{ meals: MealDbMeal[] | null }>(`${MEALDB}/search.php?s=${encodeURIComponent(term)}`)
  return (payload.meals ?? []).slice(0, 4).map((meal) => {
    const recipe = mapMealDb(meal)
    cache.set(recipe.providerId, recipe)
    return recipe
  })
}

async function mealDbIdsByIngredient(term: string): Promise<string[]> {
  const ingredient = term.trim().toLowerCase().replace(/\s+/g, '_')
  if (!ingredient) return []
  const payload = await fetchJson<{ meals: { idMeal: string }[] | null }>(`${MEALDB}/filter.php?i=${encodeURIComponent(ingredient)}`)
  return (payload.meals ?? []).slice(0, 3).map((meal) => meal.idMeal)
}

async function mealDbIdsByCategory(category: string): Promise<string[]> {
  const payload = await fetchJson<{ meals: { idMeal: string }[] | null }>(
    `${MEALDB}/filter.php?c=${encodeURIComponent(category)}`,
  )
  return (payload.meals ?? []).slice(0, 4).map((meal) => meal.idMeal)
}

interface SpoonacularResult {
  id: number
  title: string
  image?: string
  sourceName?: string
  sourceUrl?: string
  spoonacularSourceUrl?: string
  readyInMinutes?: number
  instructions?: string | null
  cuisines?: string[]
  extendedIngredients?: { name: string; amount?: number; unit?: string }[]
  analyzedInstructions?: { steps?: { step: string }[] }[]
}

function mapSpoonacular(result: SpoonacularResult): RetrievedRecipe {
  const steps =
    result.analyzedInstructions?.[0]?.steps?.map((step) => step.step).filter(Boolean) ??
    (result.instructions
      ? result.instructions
          .replace(/<[^>]+>/g, ' ')
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean)
      : [])
  const sourceUrl = result.sourceUrl?.trim() || result.spoonacularSourceUrl?.trim() || null
  const listedName = result.sourceName?.trim() || 'Spoonacular'
  const recipe: RetrievedRecipe = {
    providerId: `spoonacular:${result.id}`,
    name: result.title,
    ingredients: (result.extendedIngredients ?? []).map((item) => ({
      name: item.name,
      quantity: item.amount ?? null,
      unit: item.unit || null,
    })),
    instructions: steps,
    prepMinutes: null,
    cookMinutes: result.readyInMinutes ?? null,
    timeIsEstimated: result.readyInMinutes == null,
    imageUrl: result.image?.trim() || null,
    sourceName: displaySourceName(listedName, sourceUrl),
    sourceUrl,
    sourcePageFetched: false,
    cuisineHint: result.cuisines?.[0] ?? null,
  }
  cache.set(recipe.providerId, recipe)
  return recipe
}

async function searchSpoonacular(term: string, apiKey: string, number = 5): Promise<RetrievedRecipe[]> {
  const url = new URL('https://api.spoonacular.com/recipes/complexSearch')
  url.searchParams.set('query', term)
  url.searchParams.set('number', String(number))
  url.searchParams.set('addRecipeInformation', 'true')
  url.searchParams.set('fillIngredients', 'true')
  url.searchParams.set('instructionsRequired', 'true')
  url.searchParams.set('apiKey', apiKey)
  const payload = await fetchJson<{ results?: SpoonacularResult[] }>(url.toString())
  return (payload.results ?? []).map(mapSpoonacular)
}

function matchesPublisher(recipe: RetrievedRecipe, publishers: RecipePublisher[]): boolean {
  if (!publishers.length || !recipe.sourceUrl) return false
  const host = (() => {
    try {
      return new URL(recipe.sourceUrl).hostname.replace(/^www\./, '').toLowerCase()
    } catch {
      return ''
    }
  })()
  return publishers.some((publisher) =>
    publisher.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)),
  )
}

function rankByPreferredSources(recipes: RetrievedRecipe[], publishers: RecipePublisher[]): RetrievedRecipe[] {
  if (!publishers.length) return recipes
  return [...recipes].sort((a, b) => {
    const aHit = matchesPublisher(a, publishers) ? 1 : 0
    const bHit = matchesPublisher(b, publishers) ? 1 : 0
    return bHit - aHit
  })
}

export async function retrieveRecipes(
  terms: string[],
  preferredSiteIds: string[] = [],
): Promise<{ recipes: RetrievedRecipe[]; broadened: boolean; preferredHits: number }> {
  const unique = new Map<string, RetrievedRecipe>()
  const spoonKey = import.meta.env.VITE_SPOONACULAR_API_KEY
  const publishers = preferredPublishers(preferredSiteIds)

  for (const term of terms.slice(0, 4)) {
    const trimmed = term.trim()
    if (!trimmed) continue
    const named = await searchMealDbByName(trimmed)
    for (const recipe of named) unique.set(recipe.providerId, recipe)
    const ids = await mealDbIdsByIngredient(trimmed)
    for (const id of ids) {
      if (unique.size >= 16) break
      const recipe = await lookupMealDb(id)
      if (recipe) unique.set(recipe.providerId, recipe)
    }
    if (spoonKey) {
      const extra = await searchSpoonacular(trimmed, spoonKey, 6)
      for (const recipe of extra) unique.set(recipe.providerId, recipe)

      // Bias searches toward preferred publishers when Spoonacular indexes them.
      for (const publisher of publishers.slice(0, 3)) {
        if (unique.size >= 20) break
        const biased = await searchSpoonacular(`${trimmed} ${publisher.searchHint}`, spoonKey, 4)
        for (const recipe of biased) unique.set(recipe.providerId, recipe)
      }
    }
    if (unique.size >= 16) break
  }

  let broadened = false
  if (unique.size === 0) {
    broadened = true
    const ids = await mealDbIdsByCategory('Vegetarian')
    const more = await mealDbIdsByCategory('Breakfast')
    for (const id of [...ids, ...more]) {
      if (unique.size >= 8) break
      const recipe = await lookupMealDb(id)
      if (recipe) unique.set(recipe.providerId, recipe)
    }
  }

  const ranked = rankByPreferredSources([...unique.values()], publishers)
  const preferredHits = ranked.filter((recipe) => matchesPublisher(recipe, publishers)).length
  return { recipes: ranked.slice(0, 14), broadened, preferredHits }
}
