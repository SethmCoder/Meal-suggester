import type { InventoryItem, MealCell, MealFeedback, MealSlot, Preferences, Weekday, WeekPlan } from '../data/types'
import { MEAL_SLOTS, WEEKDAY_LABELS, WEEKDAYS } from '../data/types'
import { aiConfigured, rankWithModel } from './ai'
import { constraintUpdates, parsePlanRequest, targetCells } from './constraints'
import { allergyConflict, dietConflict, dietMealDbCategories, dietSearchTerms } from './diet'
import { ingredientKey, usableInventory } from './ingredients'
import { eatingOutSuggestions } from './eatingOut'
import { applyLeftoverPlacements } from './leftovers'
import { breakfastLike, fitsMealSlot, sweetCourseLike } from './mealSlots'
import { totalMinutes } from './meals'
import { describeAppliedPattern, PATTERN_NOTE, type RecurringCap } from './timePatterns'
import {
  fallbackSearchTerms,
  alignExplanation,
  dishKey,
  distinctDishCount,
  joinReasons,
  matchesFoodFocus,
  recipeToMeal,
  selectSuggestions,
  type Suggestion,
} from './planner'
import { filledIdealMeals, idealWords, loadIdealPlan, mealMatchesIdeal, type IdealPlan } from './idealPlan'
import { retrieveRecipes } from './recipes'

export interface AssistantResult {
  reply: string
  mode: 'ai' | 'match'
  suggestions: Suggestion[]
  constraints: ReturnType<typeof constraintUpdates>
  /** Set when short weekday caps from earlier weeks were applied. */
  patternNote?: string
  warning?: string
}

export interface SuggestOptions {
  wantWeek?: boolean
  emptyOnly?: boolean
  slots?: MealSlot[]
  dayThemes?: Partial<Record<Weekday, string>>
  /** Foods already owned that meals should use (expiring or freezer). */
  mustUse?: string[]
  /** Short caps repeated on the same weekday and slot. */
  recurringCaps?: RecurringCap[]
  /** Days filled with an Eating out placeholder instead of a cooked recipe. */
  eatOutDays?: Weekday[]
  /** Prefer recipes that use food already on hand, including for a full week. */
  forcePreferInventory?: boolean
  /** Recipe ids already shown for this slot. */
  excludeIds?: string[]
  /** Meal names already shown or rejected for this slot. */
  excludeNames?: string[]
  /** After the cook rejected a dessert/sweet, skip other sweets for this request. */
  excludeSweetCourses?: boolean
  /** Ingredients the cook just asked to leave out. */
  avoidIngredients?: string[]
  /** Ingredients and cuisines learned from meals they kept. */
  preferTerms?: string[]
  /** Suggest this cell only, even if the message mentions a week. */
  onlyCell?: { day: Weekday; slot: MealSlot }
  /** Account id used to read the saved ideal meal plan. */
  userId?: string
}

function searchTerms(
  message: string,
  inventory: InventoryItem[],
  preferences: Preferences,
  dayThemes?: Partial<Record<Weekday, string>>,
  wantWeek?: boolean,
  mustUse: string[] = [],
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
    ...mustUse,
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
  preferTerms?: string[]
  idealByCell?: IdealPlan
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
    allowReuse: distinctDishCount(pool.length ? pool : input.recipes) < missing.length || unusedRecipes.length === 0,
    foodFocus: input.foodFocus,
    preferTerms: input.preferTerms,
    idealByCell: input.idealByCell,
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
  const mustUse = input.options?.mustUse ?? []
  const foodFocus = [...new Set([...request.foodFocus, ...mustUse.map((name) => name.toLowerCase())])]
  const wantWeek = Boolean(input.options?.wantWeek || request.wantWeek) && !input.options?.onlyCell
  const hasFoodFocus = foodFocus.length > 0
  const onlyCell = input.options?.onlyCell
  const preliminary = keepCell(resolveTargets(request, input.week.cells, input.options), onlyCell)
  const constraints = constraintUpdates(input.message, { ...request, wantWeek }, preliminary)
  const appliedPatterns: RecurringCap[] = []
  const cells = input.week.cells.map((cell) => {
    const next = constraints.find((item) => item.day === cell.day && item.slot === cell.slot)
    if (next) return { ...cell, constraint: next.constraint }
    if (cell.constraint?.maxMinutes != null) return cell
    const pattern = (input.options?.recurringCaps ?? []).find((item) => item.day === cell.day && item.slot === cell.slot)
    if (!pattern) return cell
    appliedPatterns.push(pattern)
    return {
      ...cell,
      constraint: { maxMinutes: pattern.maxMinutes, note: PATTERN_NOTE },
    }
  })
  const patternConstraints = appliedPatterns.map((pattern) => ({
    day: pattern.day,
    slot: pattern.slot,
    constraint: { maxMinutes: pattern.maxMinutes, note: PATTERN_NOTE },
  }))
  const savedConstraints = [...constraints, ...patternConstraints]
  const eatOutDays = new Set(input.options?.eatOutDays ?? [])
  const requestedTargets = keepCell(resolveTargets(request, cells, input.options), onlyCell)
  const eatOutTargets = keepCell(resolveTargets(request, cells, { ...input.options, emptyOnly: false }), onlyCell).filter((cell) =>
    eatOutDays.has(cell.day),
  )
  const targets = requestedTargets.filter((cell) => !eatOutDays.has(cell.day))

  if (!targets.length) {
    const days = [...new Set(eatOutTargets.map((cell) => WEEKDAY_LABELS[cell.day]))]
    return {
      reply: days.length
        ? `Eating out on ${days.join(', ')}. Those meals are placeholders, with nothing to cook or buy.`
        : 'No meal slots were selected.',
      mode: 'match',
      suggestions: eatingOutSuggestions(eatOutTargets),
      constraints: savedConstraints,
      patternNote:
        describeAppliedPattern(
          appliedPatterns.map((pattern) => ({
            day: pattern.day,
            slot: pattern.slot,
            constraint: { maxMinutes: pattern.maxMinutes, note: PATTERN_NOTE },
          })),
        ) ?? undefined,
    }
  }

  const boostCategories = [
    ...dietMealDbCategories(input.preferences.dietary),
    ...(request.slots.includes('breakfast') || request.foodFocus.some((term) => /egg|pancake|toast|oatmeal|omelet/i.test(term))
      ? ['Breakfast']
      : []),
  ]

  const idealPlan = input.options?.userId ? loadIdealPlan(input.options.userId) : {}
  const idealSearch = targets.flatMap((cell) => idealWords(idealPlan[`${cell.day}:${cell.slot}`] ?? ''))

  const { recipes: retrieved, broadened, preferredHits } = await retrieveRecipes(
    searchTerms(
      input.message,
      input.inventory,
      input.preferences,
      input.options?.dayThemes,
      wantWeek,
      [...idealSearch, ...mustUse, ...(input.options?.preferTerms ?? [])],
    ),
    input.preferences.recipeSites,
    {
      minCount: wantWeek ? Math.max(targets.length + 5, 24) : Math.max(16, targets.length + 6),
      boostCategories: [...new Set(boostCategories)],
    },
  )
  const recipes = filterRecipes(retrieved, input.options)

  // Prefer inventory only when the user asked for it and did not name specific foods.
  const preferInventory =
    Boolean(input.options?.forcePreferInventory) || (request.preferInventory && !hasFoodFocus && !wantWeek)
  const stock = usableInventory(input.inventory)
  const allowReuse = distinctDishCount(recipes) < targets.length

  const local = selectSuggestions({
    recipes,
    targets,
    inventory: stock,
    preferences: input.preferences,
    feedback: input.feedback,
    preferInventory,
    dayThemes: input.options?.dayThemes,
    allowReuse,
    foodFocus,
    preferTerms: input.options?.preferTerms,
    idealByCell: idealPlan,
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
    foodFocus,
  )

  if (aiConfigured() && recipes.length) {
    const ranked = await rankWithModel({
      message: input.message,
      recipes,
      targets: targets.map((cell) => ({ day: cell.day, slot: cell.slot })),
      preferences: input.preferences,
      inventoryNames: stock.map((item) => item.name),
      dayThemes: input.options?.dayThemes,
      foodFocus,
      mustUseFoods: mustUse,
      likedFoods: input.options?.preferTerms,
      idealMeals: filledIdealMeals(idealPlan).filter((item) =>
        targets.some((cell) => cell.day === item.day && cell.slot === item.slot),
      ),
      timeCaps: targets
        .filter((cell) => cell.constraint?.maxMinutes != null)
        .map((cell) => ({
          day: cell.day,
          slot: cell.slot,
          maxMinutes: cell.constraint!.maxMinutes as number,
        })),
    })
    if (ranked && ranked.picks.length) {
      const fromModel = picksToSuggestions(ranked.picks, recipes, targets, input.preferences, {
        allowReuse,
        foodFocus,
      })
      if (fromModel.length) {
        suggestions = preferIdealMatches(fromModel, local.suggestions, idealPlan)
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
      inventory: stock,
      preferences: input.preferences,
      feedback: input.feedback,
      dayThemes: input.options?.dayThemes,
      foodFocus,
      preferTerms: input.options?.preferTerms,
      idealByCell: idealPlan,
    })
  }

  suggestions = [...eatingOutSuggestions(eatOutTargets), ...suggestions]
  suggestions = applyLeftoverPlacements({
    suggestions,
    cells: input.week.cells,
    targets,
  })
  if (eatOutTargets.length) {
    const days = [...new Set(eatOutTargets.map((cell) => WEEKDAY_LABELS[cell.day]))]
    reply = `${reply} Eating out on ${days.join(', ')}: those meals are placeholders, with nothing to cook or buy.`
  }

  const filledTargets = targets.filter((cell) =>
    suggestions.some((item) => item.day === cell.day && item.slot === cell.slot),
  ).length

  if (!suggestions.length) {
    const dietNote = input.preferences.dietary.length
      ? ` Current dietary rules (${input.preferences.dietary.join(', ')}) may be excluding many retrieved recipes.`
      : ''
    const focusNote = hasFoodFocus ? ` No catalog match was found for: ${foodFocus.join(', ')}.` : ''
    reply = `No retrieved recipe fit that request.${focusNote}${dietNote} Try a broader request, or loosen a strict preference.`
  } else if (filledTargets < targets.length) {
    reply = `${reply} Filled ${filledTargets} of ${targets.length} requested meal slot${targets.length === 1 ? '' : 's'}.`
  }

  suggestions = [...suggestions].sort((a, b) => {
    const dayDelta = WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day)
    if (dayDelta !== 0) return dayDelta
    return MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot)
  })

  const patternNote =
    describeAppliedPattern(
      appliedPatterns.map((pattern) => ({
        day: pattern.day,
        slot: pattern.slot,
        constraint: { maxMinutes: pattern.maxMinutes, note: PATTERN_NOTE },
      })),
    ) ?? undefined

  return { reply, mode, suggestions, constraints: savedConstraints, patternNote }
}

function keepCell<T extends { day: Weekday; slot: MealSlot }>(cells: T[], only?: { day: Weekday; slot: MealSlot }): T[] {
  if (!only) return cells
  return cells.filter((cell) => cell.day === only.day && cell.slot === only.slot)
}

function filterRecipes(
  recipes: Awaited<ReturnType<typeof retrieveRecipes>>['recipes'],
  options?: SuggestOptions,
) {
  const excludedIds = new Set(options?.excludeIds ?? [])
  const excludedNames = new Set((options?.excludeNames ?? []).map((name) => ingredientKey(name)))
  const avoid = new Set((options?.avoidIngredients ?? []).map((name) => ingredientKey(name)).filter(Boolean))
  const withoutShown = recipes.filter((recipe) => {
    if (excludedIds.has(recipe.providerId)) return false
    if (excludedNames.has(dishKey(recipe))) return false
    if (options?.excludeSweetCourses && sweetCourseLike(recipe)) return false
    return true
  })
  if (!avoid.size) return withoutShown
  const withoutAvoided = withoutShown.filter((recipe) => {
    const keys = [dishKey(recipe), ...recipe.ingredients.map((item) => ingredientKey(item.name))].filter(Boolean)
    return ![...avoid].some((term) => keys.some((key) => key === term || key.split(' ').includes(term)))
  })
  return withoutAvoided.length ? withoutAvoided : withoutShown
}

function unusedFittingRecipe(
  recipes: Awaited<ReturnType<typeof retrieveRecipes>>['recipes'],
  slot: MealSlot,
  usedIds: Set<string>,
  usedNames: Set<string>,
  currentId: string,
): boolean {
  return recipes.some((recipe) => {
    if (recipe.providerId === currentId) return false
    if (!fitsMealSlot(recipe, slot)) return false
    if ((slot === 'lunch' || slot === 'dinner') && (breakfastLike(recipe) || sweetCourseLike(recipe))) return false
    const key = dishKey(recipe)
    return !usedIds.has(recipe.providerId) && !usedNames.has(key)
  })
}

function preferIdealMatches(model: Suggestion[], local: Suggestion[], plan: IdealPlan): Suggestion[] {
  return model.map((item) => {
    const ideal = plan[`${item.day}:${item.slot}`]?.trim()
    if (!ideal) return item
    const matches = (suggestion: Suggestion) =>
      mealMatchesIdeal(
        suggestion.meal.name,
        suggestion.meal.ingredients.map((ingredient) => ingredient.name),
        ideal,
      )
    if (matches(item)) return item
    return local.find((suggestion) => suggestion.day === item.day && suggestion.slot === item.slot && matches(suggestion)) ?? item
  })
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
  const usedNames = new Set<string>()
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
    const recipe = byId.get(pick.providerId)
    if (!recipe) continue
    const nameKey = dishKey(recipe)
    const alreadyUsed = usedRecipe.has(pick.providerId) || usedNames.has(nameKey)
    const alternative = unusedFittingRecipe(recipes, pick.slot, usedRecipe, usedNames, recipe.providerId)
    if (alreadyUsed && (alternative || !options?.allowReuse)) continue
    if (!fitsMealSlot(recipe, pick.slot)) continue
    if ((pick.slot === 'lunch' || pick.slot === 'dinner') && breakfastLike(recipe) && alternative) continue
    const names = recipe.ingredients.map((item) => item.name)
    if (allergyConflict(names, recipe.name, preferences.allergies)) continue
    if (dietConflict(names, recipe.name, preferences.dietary)) continue
    const cell = targets.find((item) => item.day === pick.day && item.slot === pick.slot)
    const cap = cell?.constraint?.maxMinutes ?? null
    const minutes = totalMinutes(recipe)
    if (cap != null && minutes != null && minutes > cap) continue
    const reused = alreadyUsed
    usedRecipe.add(pick.providerId)
    usedNames.add(nameKey)
    usedCell.add(cellKey)
    const reasons = [pick.why || 'Selected from retrieved recipes.']
    if (options?.foodFocus?.length && matchesFoodFocus(recipe, options.foodFocus)) {
      reasons.unshift(`Matches your request: ${options.foodFocus.join(', ')}`)
    }
    if (reused) reasons.push('Repeated because fewer unique recipes were available than meal slots')
    if (recipe.timeIsEstimated) reasons.push('Time is estimated from the instructions, not published by the source page.')
    if (cap != null && minutes != null && minutes <= cap) {
      reasons.push(`Fits a ${cap} minute time limit`)
    }
    const saved = alignExplanation({ ...recipeToMeal(recipe), why: joinReasons(reasons) }, reasons, options?.foodFocus)
    suggestions.push({
      day: pick.day,
      slot: pick.slot,
      recipe,
      meal: saved.meal,
      reasons: saved.reasons,
    })
  }
  return suggestions
}
