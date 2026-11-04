import type { InventoryItem, MealCell, MealFeedback, MealSlot, Preferences, Weekday, WeekPlan } from '../data/types'
import { MEAL_SLOTS, WEEKDAYS } from '../data/types'
import { aiConfigured, rankWithModel } from './ai'
import { constraintUpdates, parsePlanRequest, targetCells } from './constraints'
import { allergyConflict, dietConflict, dietMealDbCategories, dietSearchTerms } from './diet'
import { ingredientKey } from './ingredients'
import { fitsMealSlot } from './mealSlots'
import { totalMinutes } from './meals'
import {
  fallbackSearchTerms,
  matchesFoodFocus,
  recipeToMeal,
  selectSuggestions,
  type Suggestion,
} from './planner'
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
  const dietTerms = dietSearchTerms(preferences.dietary)
  const weekFillers = wantWeek
    ? ['chicken', 'pasta', 'salad', 'egg', 'rice', 'fish', 'beef', 'soup', 'bean', 'potato', 'breakfast', 'sandwich']
    : []
  const slotFillers = request.slots.includes('breakfast') ? ['egg', 'omelette', 'pancake', 'toast', 'oatmeal'] : []
  const terms = [
    ...request.foodFocus,
    ...themeTerms,
    ...words,
    ...dietTerms,
    ...slotFillers,
    ...preferences.favorites.slice(0, 2),
    ...preferences.cuisines.slice(0, 2),
    ...weekFillers,
  ]
  if (request.preferInventory || (terms.length === 0 && !request.foodFocus.length)) {
    terms.push(...inventoryTerms)
  }
  if (terms.length === 0) terms.push(...fallbackSearchTerms(preferences))
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, wantWeek ? 12 : 10)
}

function resolveTargets(
  request: ReturnType<typeof parsePlanRequest>,
  cells: MealCell[],
  options?: SuggestOptions,
): MealCell[] {
  const wantWeek = Boolean(options?.wantWeek || request.wantWeek)
  const nextRequest = {
    ...request,
    wantWeek,
    days: wantWeek ? [] : request.days,
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
  foodFocus?: string[]
}): Suggestion[] {
  const filled = new Set(input.existing.map((item) => `${item.day}:${item.slot}`))
  const missing = input.targets.filter((cell) => !filled.has(`${cell.day}:${cell.slot}`))
  if (!missing.length) return input.existing

  const usedIds = new Set(input.existing.map((item) => item.recipe.providerId))
  const unusedRecipes = input.recipes.filter((recipe) => !usedIds.has(recipe.providerId))
  const focusFirst = input.foodFocus?.length
    ? unusedRecipes.filter((recipe) => matchesFoodFocus(recipe, input.foodFocus))
    : []
  const pool = (focusFirst.length ? focusFirst : unusedRecipes).length
    ? focusFirst.length
      ? [...focusFirst, ...unusedRecipes.filter((recipe) => !focusFirst.includes(recipe))]
      : unusedRecipes
    : input.recipes
  const filler = selectSuggestions({
    recipes: pool,
    targets: missing,
    inventory: input.inventory,
    preferences: input.preferences,
    feedback: input.feedback,
    preferInventory: false,
    dayThemes: input.dayThemes,
    allowReuse: true,
    foodFocus: input.foodFocus,
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
  const hasFoodFocus = request.foodFocus.length > 0
  const preliminary = resolveTargets(request, input.week.cells, input.options)
  const constraints = constraintUpdates(input.message, { ...request, wantWeek }, preliminary)
  const cells = input.week.cells.map((cell) => {
    const next = constraints.find((item) => item.day === cell.day && item.slot === cell.slot)
    return next ? { ...cell, constraint: next.constraint } : cell
  })
  const targets = resolveTargets(request, cells, input.options)

  const boostCategories = [
    ...dietMealDbCategories(input.preferences.dietary),
    ...(request.slots.includes('breakfast') || request.foodFocus.some((term) => /egg|pancake|toast|oatmeal|omelet/i.test(term))
      ? ['Breakfast']
      : []),
  ]

  const { recipes, broadened, preferredHits } = await retrieveRecipes(
    searchTerms(input.message, input.inventory, input.preferences, input.options?.dayThemes, wantWeek),
    input.preferences.recipeSites,
    {
      minCount: wantWeek ? Math.max(targets.length + 5, 24) : Math.max(16, targets.length + 6),
      boostCategories: [...new Set(boostCategories)],
    },
  )

  // Prefer inventory only when the user asked for it and did not name specific foods.
  const preferInventory = request.preferInventory && !hasFoodFocus && !wantWeek

  const local = selectSuggestions({
    recipes,
    targets,
    inventory: input.inventory,
    preferences: input.preferences,
    feedback: input.feedback,
    preferInventory,
    dayThemes: input.options?.dayThemes,
    allowReuse: wantWeek || targets.length > recipes.length,
    foodFocus: request.foodFocus,
  })

  let suggestions = local.suggestions
  let mode: AssistantResult['mode'] = 'match'
  let reply = matchReply(
    suggestions,
    targets,
    broadened,
    local.relaxedDislikes,
    local.relaxedInventory,
    input.preferences.instructions,
    preferredHits,
    input.options?.dayThemes,
    request.foodFocus,
  )

  if (aiConfigured() && recipes.length) {
    const ranked = await rankWithModel({
      message: input.message,
      recipes,
      targets: targets.map((cell) => ({ day: cell.day, slot: cell.slot })),
      preferences: input.preferences,
      inventoryNames: input.inventory.map((item) => item.name),
      dayThemes: input.options?.dayThemes,
      foodFocus: request.foodFocus,
    })
    if (ranked && ranked.picks.length) {
      const fromModel = picksToSuggestions(ranked.picks, recipes, targets, input.preferences, {
        allowReuse: wantWeek || targets.length > 3,
        foodFocus: request.foodFocus,
      })
      if (fromModel.length) {
        suggestions = fromModel
        mode = 'ai'
        reply = ranked.reply || 'Here are meals chosen from recipes that were actually retrieved.'
      }
    } else if (ranked?.reply && !suggestions.length) {
      mode = 'ai'
      reply = ranked.reply
    }
  }

  if (suggestions.length < targets.length) {
    suggestions = backfillSuggestions({
      existing: suggestions,
      recipes,
      targets,
      inventory: input.inventory,
      preferences: input.preferences,
      feedback: input.feedback,
      dayThemes: input.options?.dayThemes,
      foodFocus: request.foodFocus,
    })
  }

  if (!suggestions.length) {
    const dietNote = input.preferences.dietary.length
      ? ` Current dietary rules (${input.preferences.dietary.join(', ')}) may be excluding many retrieved recipes.`
      : ''
    const focusNote = hasFoodFocus ? ` No catalog match was found for: ${request.foodFocus.join(', ')}.` : ''
    reply = `No retrieved recipe fit that request.${focusNote}${dietNote} Try a broader request, or loosen a strict preference.`
  } else if (suggestions.length < targets.length) {
    reply = `${reply} Filled ${suggestions.length} of ${targets.length} requested meal slot${targets.length === 1 ? '' : 's'}.`
  }

  suggestions = [...suggestions].sort((a, b) => {
    const dayDelta = WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day)
    if (dayDelta !== 0) return dayDelta
    return MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot)
  })

  return { reply, mode, suggestions, constraints }
}

function matchReply(
  suggestions: Suggestion[],
  targets: MealCell[],
  broadened: boolean,
  relaxedDislikes: boolean,
  relaxedInventory: boolean,
  instructions: string,
  preferredHits: number,
  dayThemes?: Partial<Record<Weekday, string>>,
  foodFocus?: string[],
): string {
  const parts = [
    suggestions.length
      ? `I matched ${suggestions.length} retrieved recipe${suggestions.length === 1 ? '' : 's'} for ${targets.length} meal${targets.length === 1 ? '' : 's'}.`
      : 'I could not match a retrieved recipe to that request.',
  ]
  if (foodFocus?.length) parts.push(`Focused on: ${foodFocus.join(', ')}.`)
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
  if (relaxedInventory) parts.push('Inventory-only matching was too narrow, so other retrieved recipes were included.')
  if (instructions.trim()) {
    parts.push('Saved AI instructions are applied when a model is configured.')
  }
  return parts.join(' ')
}

function picksToSuggestions(
  picks: { providerId: string; day: MealCell['day']; slot: MealCell['slot']; why: string }[],
  recipes: Awaited<ReturnType<typeof retrieveRecipes>>['recipes'],
  targets: MealCell[],
  preferences: Preferences,
  options?: { allowReuse?: boolean; foodFocus?: string[] },
): Suggestion[] {
  const byId = new Map(recipes.map((recipe) => [recipe.providerId, recipe]))
  const allowed = new Set(targets.map((cell) => `${cell.day}:${cell.slot}`))
  const usedRecipe = new Set<string>()
  const usedCell = new Set<string>()
  const suggestions: Suggestion[] = []

  const ordered = [...picks].sort((a, b) => {
    const aRecipe = byId.get(a.providerId)
    const bRecipe = byId.get(b.providerId)
    const aHit = aRecipe && matchesFoodFocus(aRecipe, options?.foodFocus) ? 1 : 0
    const bHit = bRecipe && matchesFoodFocus(bRecipe, options?.foodFocus) ? 1 : 0
    return bHit - aHit
  })

  for (const pick of ordered) {
    const cellKey = `${pick.day}:${pick.slot}`
    if (!allowed.has(cellKey) || usedCell.has(cellKey)) continue
    if (usedRecipe.has(pick.providerId) && !options?.allowReuse) continue
    const recipe = byId.get(pick.providerId)
    if (!recipe) continue
    const names = recipe.ingredients.map((item) => item.name)
    if (allergyConflict(names, recipe.name, preferences.allergies)) continue
    if (dietConflict(names, recipe.name, preferences.dietary)) continue
    if (!fitsMealSlot(recipe, pick.slot)) continue
    const cell = targets.find((item) => item.day === pick.day && item.slot === pick.slot)
    const cap = cell?.constraint?.maxMinutes ?? null
    const minutes = totalMinutes(recipe)
    if (cap != null && minutes != null && minutes > cap) continue
    const reused = usedRecipe.has(pick.providerId)
    usedRecipe.add(pick.providerId)
    usedCell.add(cellKey)
    const reasons = [pick.why || 'Selected from retrieved recipes.']
    if (options?.foodFocus?.length && matchesFoodFocus(recipe, options.foodFocus)) {
      reasons.unshift(`Matches your request: ${options.foodFocus.join(', ')}`)
    }
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
