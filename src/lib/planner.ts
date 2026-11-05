import type { InventoryItem, Meal, MealCell, MealFeedback, Preferences, RetrievedRecipe } from '../data/types'
import { allergyConflict, containsTerm, dietConflict, dislikedConflict } from './diet'
import { createId } from './id'
import { ingredientKey, matchIngredient } from './ingredients'
import { fitsMealSlot, slotScore } from './mealSlots'
import { openPackageGaps, packageFillBonus } from './packages'
import { totalMinutes } from './meals'
import { preferredPublishers } from './recipeSources'
import { simplifyMeal } from './simpleMeals'

function recipeIngredientKeys(recipe: RetrievedRecipe): string[] {
  return recipe.ingredients.map((item) => ingredientKey(item.name)).filter(Boolean)
}

export interface Suggestion {
  day: MealCell['day']
  slot: MealCell['slot']
  recipe: RetrievedRecipe
  meal: Meal
  reasons: string[]
}

export function recipeToMeal(recipe: RetrievedRecipe): Meal {
  return simplifyMeal({
    id: createId(),
    name: recipe.name,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    timeIsEstimated: recipe.timeIsEstimated,
    imageUrl: recipe.imageUrl,
    sourceName: recipe.sourceName,
    sourceUrl: recipe.sourceUrl,
    sourceRetrieved: true,
    sourcePageFetched: recipe.sourcePageFetched,
  })
}

/** Join matcher reasons into one short paragraph stored on the meal. */
export function joinReasons(reasons: string[]): string {
  const parts = [...new Set(reasons.map((reason) => reason.trim()).filter(Boolean))]
  if (!parts.length) return 'Chosen because it fits this meal slot.'
  return parts.map((part) => (/[.!?]$/.test(part) ? part : `${part}.`)).join(' ')
}

function withExplanation(meal: Meal, reasons: string[]): Meal {
  return { ...meal, why: joinReasons(reasons) }
}

function ingredientNames(recipe: RetrievedRecipe): string[] {
  return recipe.ingredients.map((ingredient) => ingredient.name)
}

function fitsTime(recipe: RetrievedRecipe, maxMinutes: number | null): boolean {
  if (maxMinutes == null) return true
  const total = totalMinutes(recipe)
  if (total == null) return true
  return total <= maxMinutes
}

interface Scored {
  recipe: RetrievedRecipe
  value: number
  reasons: string[]
  using: number
}

function scoreRecipe(
  recipe: RetrievedRecipe,
  inventory: InventoryItem[],
  preferences: Preferences,
  feedback: MealFeedback[],
): Scored {
  const reasons: string[] = []
  let value = 0
  let using = 0
  for (const ingredient of recipe.ingredients) {
    const status = matchIngredient(ingredient, inventory).status
    if (status === 'have' || status === 'partial') using += 1
  }
  if (using) {
    value += using * 3
    reasons.push(`Uses ${using} ingredient${using === 1 ? '' : 's'} you already have`)
  }
  const missing = Math.max(0, recipe.ingredients.length - using)
  value -= missing
  if (recipe.ingredients.length && missing === 0) reasons.push('Every listed ingredient is in inventory')
  else if (missing) reasons.push(`${missing} ingredient${missing === 1 ? '' : 's'} still to buy`)

  for (const favorite of preferences.favorites) {
    if (containsTerm(recipe.name, favorite) || recipe.ingredients.some((item) => containsTerm(item.name, favorite))) {
      value += 4
      reasons.push(`Fits your favorite: ${favorite}`)
      break
    }
  }

  if (
    recipe.cuisineHint &&
    preferences.cuisines.some(
      (cuisine) =>
        recipe.cuisineHint?.toLowerCase().includes(cuisine.toLowerCase()) ||
        cuisine.toLowerCase().includes(recipe.cuisineHint?.toLowerCase() ?? ''),
    )
  ) {
    value += 3
    reasons.push(`${recipe.cuisineHint} cuisine`)
  }

  const publishers = preferredPublishers(preferences.recipeSites ?? [])
  if (publishers.length && recipe.sourceUrl) {
    const host = (() => {
      try {
        return new URL(recipe.sourceUrl!).hostname.replace(/^www\./, '').toLowerCase()
      } catch {
        return ''
      }
    })()
    const hit = publishers.find((publisher) =>
      publisher.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)),
    )
    if (hit) {
      value += 6
      reasons.push(`From preferred site: ${hit.name}`)
    }
  }

  const accepted = feedback.filter((item) => item.accepted).map((item) => ingredientKey(item.mealName))
  if (accepted.some((name) => name && ingredientKey(recipe.name) === name)) {
    value += 5
    reasons.push('You kept a meal like this before')
  }

  if (preferences.skill === 'beginner') {
    const total = totalMinutes(recipe)
    if (total != null && total <= 45) value += 1
  }

  const minutes = totalMinutes(recipe)
  if (minutes != null) {
    reasons.push(recipe.timeIsEstimated ? `About ${minutes} minutes, estimated from the instructions` : `${minutes} minutes`)
  }

  return { recipe, value, reasons, using }
}

function matchesDayTheme(recipe: RetrievedRecipe, theme: string | undefined): boolean {
  if (!theme?.trim()) return false
  const terms = theme
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2)
  if (!terms.length) return false
  const hay = `${recipe.name} ${recipe.cuisineHint ?? ''} ${recipe.ingredients.map((item) => item.name).join(' ')}`.toLowerCase()
  return terms.some((term) => hay.includes(term))
}

export function selectSuggestions(input: {
  recipes: RetrievedRecipe[]
  targets: MealCell[]
  inventory: InventoryItem[]
  preferences: Preferences
  feedback: MealFeedback[]
  preferInventory: boolean
  dayThemes?: Partial<Record<MealCell['day'], string>>
  /** When true, reuse recipes after the unique pool is exhausted so every target can be filled. */
  allowReuse?: boolean
  /** User-requested foods/cuisines, e.g. egg, scrambled. */
  foodFocus?: string[]
}): { suggestions: Suggestion[]; relaxedDislikes: boolean; relaxedInventory: boolean } {
  const rejected = new Set(
    input.feedback.filter((item) => !item.accepted).map((item) => ingredientKey(item.mealName)),
  )

  const eligible = input.recipes.filter((recipe) => {
    if (rejected.has(ingredientKey(recipe.name))) return false
    if (allergyConflict(ingredientNames(recipe), recipe.name, input.preferences.allergies)) return false
    if (dietConflict(ingredientNames(recipe), recipe.name, input.preferences.dietary)) return false
    return true
  })

  let pool = eligible.filter(
    (recipe) => !dislikedConflict(ingredientNames(recipe), recipe.name, input.preferences.disliked),
  )
  const relaxedDislikes = pool.length === 0 && eligible.length > 0
  if (relaxedDislikes) pool = eligible

  let scored = pool.map((recipe) => {
    const base = scoreRecipe(recipe, input.inventory, input.preferences, input.feedback)
    const focus = input.foodFocus ?? []
    if (!focus.length) return base
    const hay = `${recipe.name} ${recipe.cuisineHint ?? ''} ${recipe.categoryHint ?? ''} ${recipeIngredientKeys(recipe).join(' ')}`.toLowerCase()
    const hits = focus.filter((term) => hay.includes(term.toLowerCase()))
    if (!hits.length) return base
    return {
      ...base,
      value: base.value + hits.length * 8 + 6,
      reasons: [`Matches your request: ${hits.join(', ')}`, ...base.reasons],
    }
  })

  let relaxedInventory = false
  if (input.preferInventory && scored.some((item) => item.using > 0)) {
    const inventoryOnly = scored.filter((item) => item.using > 0)
    // Keep inventory bias only when it still leaves enough options for the targets.
    if (inventoryOnly.length >= Math.min(3, Math.max(1, input.targets.length))) {
      scored = inventoryOnly
    } else {
      relaxedInventory = true
    }
  }
  scored.sort((a, b) => b.value - a.value || a.recipe.name.localeCompare(b.recipe.name))

  const used = new Set<string>()
  const sharedIngredients = new Set<string>()
  const suggestions: Suggestion[] = []
  for (const cell of input.targets) {
    const cap = cell.constraint?.maxMinutes ?? null
    const theme = input.dayThemes?.[cell.day]
    const openPacks = openPackageGaps(
      suggestions.map((item) => item.meal),
      input.inventory,
    )
    const timed = scored
      .filter((item) => fitsTime(item.recipe, cap) && fitsMealSlot(item.recipe, cell.slot))
      .map((item) => {
        const fit = slotScore(item.recipe, cell.slot)
        const overlap = recipeIngredientKeys(item.recipe).filter((key) => sharedIngredients.has(key)).length
        const reuseBonus = overlap > 0 ? overlap * 5 + 2 : 0
        const packBonus = packageFillBonus(item.recipe, openPacks)
        const reasons = fit.reason ? [...item.reasons, fit.reason] : [...item.reasons]
        if (overlap > 0) {
          reasons.push(`Reuses ${overlap} ingredient${overlap === 1 ? '' : 's'} from other planned meals`)
        }
        if (packBonus.reason) reasons.push(packBonus.reason)
        return {
          ...item,
          value: item.value + fit.delta + reuseBonus + packBonus.delta,
          reasons,
        }
      })
      .sort((a, b) => b.value - a.value || a.recipe.name.localeCompare(b.recipe.name))
    const unused = timed.filter((item) => !used.has(item.recipe.providerId))
    const pool = unused.length ? unused : input.allowReuse ? timed : []
    const themed = theme ? pool.filter((item) => matchesDayTheme(item.recipe, theme)) : []
    // Prefer theme match among slot-appropriate recipes; never fall back to desserts.
    const best = themed[0] ?? pool[0]
    if (!best) continue
    const reused = used.has(best.recipe.providerId)
    used.add(best.recipe.providerId)
    for (const key of recipeIngredientKeys(best.recipe)) sharedIngredients.add(key)
    const reasons = [...best.reasons]
    if (theme && themed[0]) reasons.unshift(`Matches ${cell.day} theme: ${theme}`)
    if (reused) reasons.push('Repeated because fewer unique recipes were available than meal slots')
    const minutes = totalMinutes(best.recipe)
    if (cap != null && minutes != null && minutes <= cap) {
      reasons.push(`Fits a ${cap} minute time limit`)
    }
    suggestions.push({
      day: cell.day,
      slot: cell.slot,
      recipe: best.recipe,
      meal: withExplanation(recipeToMeal(best.recipe), reasons),
      reasons,
    })
  }

  return { suggestions, relaxedDislikes, relaxedInventory }
}

export function fallbackSearchTerms(preferences: Preferences): string[] {
  const diet = preferences.dietary.join(' ').toLowerCase()
  if (diet.includes('vegan')) return ['tofu', 'lentil', 'chickpea', 'vegetable']
  if (diet.includes('vegetarian')) return ['vegetable', 'bean', 'egg', 'cheese']
  if (diet.includes('gluten')) return ['rice', 'potato', 'salad', 'chicken']
  return ['chicken', 'vegetable', 'egg']
}

export function matchesFoodFocus(recipe: RetrievedRecipe, foodFocus: string[] | undefined): boolean {
  if (!foodFocus?.length) return true
  const hay = `${recipe.name} ${recipe.cuisineHint ?? ''} ${recipe.categoryHint ?? ''} ${recipeIngredientKeys(recipe).join(' ')}`.toLowerCase()
  return foodFocus.some((term) => hay.includes(term.toLowerCase()))
}
