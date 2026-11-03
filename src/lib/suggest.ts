import type { InventoryItem, MealCell, MealFeedback, Preferences, WeekPlan } from '../data/types'
import { aiConfigured, rankWithModel } from './ai'
import { constraintUpdates, parsePlanRequest, targetCells } from './constraints'
import { allergyConflict, dietConflict } from './diet'
import { ingredientKey } from './ingredients'
import { totalMinutes } from './meals'
import { fallbackSearchTerms, recipeToMeal, selectSuggestions, type Suggestion } from './planner'
import { retrieveRecipes } from './recipes'

export interface AssistantResult {
  reply: string
  mode: 'ai' | 'match'
  suggestions: Suggestion[]
  constraints: ReturnType<typeof constraintUpdates>
  warning?: string
}

function searchTerms(message: string, inventory: InventoryItem[], preferences: Preferences): string[] {
  const request = parsePlanRequest(message)
  const words = request.queryText.split(/\s+/).filter((word) => word.length > 2)
  const inventoryTerms = [...inventory]
    .sort((a, b) => Number(Boolean(b.expiresOn)) - Number(Boolean(a.expiresOn)))
    .map((item) => ingredientKey(item.name))
    .filter(Boolean)
    .slice(0, 4)
  const terms = [...words, ...preferences.favorites.slice(0, 2), ...preferences.cuisines.slice(0, 2)]
  if (request.preferInventory || terms.length === 0) terms.push(...inventoryTerms)
  if (terms.length === 0) terms.push(...fallbackSearchTerms(preferences))
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, 6)
}

export async function suggestMeals(input: {
  message: string
  inventory: InventoryItem[]
  preferences: Preferences
  week: WeekPlan
  feedback: MealFeedback[]
}): Promise<AssistantResult> {
  const request = parsePlanRequest(input.message)
  const preliminary = targetCells(request, input.week.cells)
  const constraints = constraintUpdates(input.message, request, preliminary)
  const cells = input.week.cells.map((cell) => {
    const next = constraints.find((item) => item.day === cell.day && item.slot === cell.slot)
    return next ? { ...cell, constraint: next.constraint } : cell
  })
  const targets = targetCells(request, cells)
  const { recipes, broadened, preferredHits } = await retrieveRecipes(
    searchTerms(input.message, input.inventory, input.preferences),
    input.preferences.recipeSites,
  )
  const local = selectSuggestions({
    recipes,
    targets,
    inventory: input.inventory,
    preferences: input.preferences,
    feedback: input.feedback,
    preferInventory: true,
  })

  let suggestions = local.suggestions
  let mode: AssistantResult['mode'] = 'match'
  let reply = matchReply(
    suggestions,
    targets,
    broadened,
    local.relaxedDislikes,
    input.preferences.instructions,
    preferredHits,
  )

  if (aiConfigured()) {
    const ranked = await rankWithModel({
      message: input.message,
      recipes,
      targets: targets.map((cell) => ({ day: cell.day, slot: cell.slot })),
      preferences: input.preferences,
      inventoryNames: input.inventory.map((item) => item.name),
    })
    if (ranked && ranked.picks.length) {
      const fromModel = picksToSuggestions(ranked.picks, recipes, targets, input.preferences)
      if (fromModel.length) {
        suggestions = fromModel
        mode = 'ai'
        reply = ranked.reply || 'Here are meals chosen from recipes that were actually retrieved.'
      }
    } else if (ranked?.reply) {
      mode = 'ai'
      reply = ranked.reply
    }
  }

  if (!suggestions.length) {
    reply = 'No retrieved recipe fit your allergies, diet, and time limits. Try a different request or adjust a strict preference.'
  }

  return { reply, mode, suggestions, constraints }
}

function matchReply(
  suggestions: Suggestion[],
  targets: MealCell[],
  broadened: boolean,
  relaxedDislikes: boolean,
  instructions: string,
  preferredHits: number,
): string {
  const parts = [
    suggestions.length
      ? `I matched ${suggestions.length} retrieved recipe${suggestions.length === 1 ? '' : 's'} for ${targets.length} meal${targets.length === 1 ? '' : 's'}.`
      : 'I could not match a retrieved recipe to that request.',
  ]
  if (preferredHits > 0) {
    parts.push(
      `${preferredHits} retrieved result${preferredHits === 1 ? '' : 's'} linked to your preferred sites when the aggregator provided a real source URL.`,
    )
  }
  if (broadened) parts.push('The first search was thin, so these include broader recipes from TheMealDB.')
  if (relaxedDislikes) parts.push('Strict dislike filters left no recipes, so dislike matches were allowed. Allergies were still excluded.')
  if (instructions.trim()) {
    parts.push('Saved AI instructions are applied only when an AI model is configured.')
  } else {
    parts.push('Recipe matching is active. A generative model is not configured.')
  }
  return parts.join(' ')
}

function picksToSuggestions(
  picks: { providerId: string; day: MealCell['day']; slot: MealCell['slot']; why: string }[],
  recipes: Awaited<ReturnType<typeof retrieveRecipes>>['recipes'],
  targets: MealCell[],
  preferences: Preferences,
): Suggestion[] {
  const byId = new Map(recipes.map((recipe) => [recipe.providerId, recipe]))
  const allowed = new Set(targets.map((cell) => `${cell.day}:${cell.slot}`))
  const usedRecipe = new Set<string>()
  const usedCell = new Set<string>()
  const suggestions: Suggestion[] = []
  for (const pick of picks) {
    const cellKey = `${pick.day}:${pick.slot}`
    if (!allowed.has(cellKey) || usedCell.has(cellKey) || usedRecipe.has(pick.providerId)) continue
    const recipe = byId.get(pick.providerId)
    if (!recipe) continue
    const names = recipe.ingredients.map((item) => item.name)
    if (allergyConflict(names, recipe.name, preferences.allergies)) continue
    if (dietConflict(names, recipe.name, preferences.dietary)) continue
    const cell = targets.find((item) => item.day === pick.day && item.slot === pick.slot)
    const cap = cell?.constraint?.maxMinutes ?? null
    const minutes = totalMinutes(recipe)
    if (cap != null && minutes != null && minutes > cap) continue
    usedRecipe.add(pick.providerId)
    usedCell.add(cellKey)
    const reasons = [pick.why || 'Selected from retrieved recipes.']
    if (recipe.timeIsEstimated) reasons.push('Time is estimated from the instructions, not published by the source page.')
    suggestions.push({
      day: pick.day,
      slot: pick.slot,
      recipe,
      meal: recipeToMeal(recipe),
      reasons,
    })
  }
  return suggestions
}
