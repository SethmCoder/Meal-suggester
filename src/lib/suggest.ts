import type { InventoryItem, MealCell, MealFeedback, MealSlot, Preferences, Weekday, WeekPlan } from '../data/types'
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

export interface SuggestOptions {
  wantWeek?: boolean
  emptyOnly?: boolean
  slots?: MealSlot[]
  dayThemes?: Partial<Record<Weekday, string>>
}

function searchTerms(
  message: string,
  inventory: InventoryItem[],
  preferences: Preferences,
  dayThemes?: Partial<Record<Weekday, string>>,
  wantWeek?: boolean,
): string[] {
  const request = parsePlanRequest(message)
  const words = request.queryText.split(/\s+/).filter((word) => word.length > 2)
  const inventoryTerms = [...inventory]
    .sort((a, b) => Number(Boolean(b.expiresOn)) - Number(Boolean(a.expiresOn)))
    .map((item) => ingredientKey(item.name))
    .filter(Boolean)
    .slice(0, 4)
  const themeTerms = Object.values(dayThemes ?? {})
    .flatMap((theme) => theme.toLowerCase().split(/[^a-z0-9]+/))
    .filter((word) => word.length > 2)
  const weekFillers = wantWeek
    ? ['chicken', 'pasta', 'salad', 'egg', 'rice', 'fish', 'beef', 'soup', 'bean', 'potato', 'breakfast', 'sandwich']
    : []
  const terms = [
    ...themeTerms,
    ...words,
    ...preferences.favorites.slice(0, 2),
    ...preferences.cuisines.slice(0, 2),
    ...weekFillers,
  ]
  if (request.preferInventory || terms.length === 0) terms.push(...inventoryTerms)
  if (terms.length === 0) terms.push(...fallbackSearchTerms(preferences))
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, wantWeek ? 12 : 10)
}

function resolveTargets(
  request: ReturnType<typeof parsePlanRequest>,
  cells: MealCell[],
  options?: SuggestOptions,
): MealCell[] {
  const nextRequest = {
    ...request,
    wantWeek: options?.wantWeek || request.wantWeek,
    slots: options?.slots?.length ? options.slots : request.slots,
  }
  let targets = targetCells(nextRequest, cells)
  if (options?.slots?.length) {
    targets = targets.filter((cell) => options.slots!.includes(cell.slot))
  }
  if (options?.emptyOnly) {
    targets = targets.filter((cell) => !cell.meal)
  }
  return targets
}

function backfillSuggestions(input: {
  existing: Suggestion[]
  recipes: Awaited<ReturnType<typeof retrieveRecipes>>['recipes']
  targets: MealCell[]
  inventory: InventoryItem[]
  preferences: Preferences
  feedback: MealFeedback[]
  dayThemes?: Partial<Record<Weekday, string>>
}): Suggestion[] {
  const filled = new Set(input.existing.map((item) => `${item.day}:${item.slot}`))
  const missing = input.targets.filter((cell) => !filled.has(`${cell.day}:${cell.slot}`))
  if (!missing.length) return input.existing

  const usedIds = new Set(input.existing.map((item) => item.recipe.providerId))
  const unusedRecipes = input.recipes.filter((recipe) => !usedIds.has(recipe.providerId))
  const pool = unusedRecipes.length ? unusedRecipes : input.recipes
  const filler = selectSuggestions({
    recipes: pool,
    targets: missing,
    inventory: input.inventory,
    preferences: input.preferences,
    feedback: input.feedback,
    preferInventory: false,
    dayThemes: input.dayThemes,
    allowReuse: true,
  })
  return [...input.existing, ...filler.suggestions]
}

export async function suggestMeals(input: {
  message: string
  inventory: InventoryItem[]
  preferences: Preferences
  week: WeekPlan
  feedback: MealFeedback[]
  options?: SuggestOptions
}): Promise<AssistantResult> {
  const request = parsePlanRequest(input.message)
  const wantWeek = Boolean(input.options?.wantWeek || request.wantWeek)
  const preliminary = resolveTargets(request, input.week.cells, input.options)
  const constraints = constraintUpdates(input.message, { ...request, wantWeek }, preliminary)
  const cells = input.week.cells.map((cell) => {
    const next = constraints.find((item) => item.day === cell.day && item.slot === cell.slot)
    return next ? { ...cell, constraint: next.constraint } : cell
  })
  const targets = resolveTargets(request, cells, input.options)
  const { recipes, broadened, preferredHits } = await retrieveRecipes(
    searchTerms(input.message, input.inventory, input.preferences, input.options?.dayThemes, wantWeek),
    input.preferences.recipeSites,
    { minCount: wantWeek ? Math.max(targets.length + 5, 24) : 14 },
  )
  const local = selectSuggestions({
    recipes,
    targets,
    inventory: input.inventory,
    preferences: input.preferences,
    feedback: input.feedback,
    preferInventory: wantWeek ? request.preferInventory : true,
    dayThemes: input.options?.dayThemes,
    allowReuse: wantWeek,
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
    input.options?.dayThemes,
  )

  if (aiConfigured()) {
    const ranked = await rankWithModel({
      message: input.message,
      recipes,
      targets: targets.map((cell) => ({ day: cell.day, slot: cell.slot })),
      preferences: input.preferences,
      inventoryNames: input.inventory.map((item) => item.name),
      dayThemes: input.options?.dayThemes,
    })
    if (ranked && ranked.picks.length) {
      const fromModel = picksToSuggestions(ranked.picks, recipes, targets, input.preferences, {
        allowReuse: wantWeek,
      })
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

  if (wantWeek && suggestions.length < targets.length) {
    suggestions = backfillSuggestions({
      existing: suggestions,
      recipes,
      targets,
      inventory: input.inventory,
      preferences: input.preferences,
      feedback: input.feedback,
      dayThemes: input.options?.dayThemes,
    })
    if (suggestions.length) {
      reply = `${reply} Filled ${suggestions.length} of ${targets.length} weekday meal slots.`
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
  dayThemes?: Partial<Record<Weekday, string>>,
): string {
  const parts = [
    suggestions.length
      ? `I matched ${suggestions.length} retrieved recipe${suggestions.length === 1 ? '' : 's'} for ${targets.length} meal${targets.length === 1 ? '' : 's'}.`
      : 'I could not match a retrieved recipe to that request.',
  ]
  const themedDays = Object.entries(dayThemes ?? {}).filter(([, theme]) => theme.trim()).length
  if (themedDays > 0) {
    parts.push(`Day themes were applied for ${themedDays} day${themedDays === 1 ? '' : 's'}.`)
  }
  if (preferredHits > 0) {
    parts.push(
      `${preferredHits} retrieved result${preferredHits === 1 ? '' : 's'} came from your preferred recipe sites.`,
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
  options?: { allowReuse?: boolean },
): Suggestion[] {
  const byId = new Map(recipes.map((recipe) => [recipe.providerId, recipe]))
  const allowed = new Set(targets.map((cell) => `${cell.day}:${cell.slot}`))
  const usedRecipe = new Set<string>()
  const usedCell = new Set<string>()
  const suggestions: Suggestion[] = []
  for (const pick of picks) {
    const cellKey = `${pick.day}:${pick.slot}`
    if (!allowed.has(cellKey) || usedCell.has(cellKey)) continue
    if (usedRecipe.has(pick.providerId) && !options?.allowReuse) continue
    const recipe = byId.get(pick.providerId)
    if (!recipe) continue
    const names = recipe.ingredients.map((item) => item.name)
    if (allergyConflict(names, recipe.name, preferences.allergies)) continue
    if (dietConflict(names, recipe.name, preferences.dietary)) continue
    const cell = targets.find((item) => item.day === pick.day && item.slot === pick.slot)
    const cap = cell?.constraint?.maxMinutes ?? null
    const minutes = totalMinutes(recipe)
    if (cap != null && minutes != null && minutes > cap) continue
    const reused = usedRecipe.has(pick.providerId)
    usedRecipe.add(pick.providerId)
    usedCell.add(cellKey)
    const reasons = [pick.why || 'Selected from retrieved recipes.']
    if (reused) reasons.push('Repeated because fewer unique recipes were available than meal slots')
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
