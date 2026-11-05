import type { InventoryItem, Meal, MealCell, MealFeedback, Preferences, RetrievedRecipe, WeekPlan } from '../data/types'
import { aiConfigured, optimizeWeekWithModel } from './ai'
import { allergyConflict, dietConflict } from './diet'
import { buildShoppingList, ingredientKey } from './ingredients'
import { fitsMealSlot } from './mealSlots'
import { recipeToMeal } from './planner'
import { retrieveRecipes } from './recipes'
import { totalMinutes } from './meals'

function mealIngredientKeys(meal: Meal | RetrievedRecipe): string[] {
  return meal.ingredients.map((item) => ingredientKey(item.name)).filter(Boolean)
}

function inventoryKeys(inventory: InventoryItem[]): Set<string> {
  return new Set(inventory.map((item) => ingredientKey(item.name)).filter(Boolean))
}

function overlapCount(recipe: RetrievedRecipe, pool: Set<string>): number {
  return mealIngredientKeys(recipe).filter((key) => pool.has(key)).length
}

function uniqueNewCount(recipe: RetrievedRecipe, pool: Set<string>): number {
  return mealIngredientKeys(recipe).filter((key) => !pool.has(key)).length
}

function shoppingScore(before: number, after: number, swaps: number): string {
  if (after < before) return `Shopping list dropped from ${before} to ${after} item${after === 1 ? '' : 's'} (${swaps} meal${swaps === 1 ? '' : 's'} adjusted).`
  if (swaps === 0) return `Already well optimized — shopping list stays at ${after} item${after === 1 ? '' : 's'}.`
  return `Adjusted ${swaps} meal${swaps === 1 ? '' : 's'} for more ingredient overlap. Shopping list is ${after} item${after === 1 ? '' : 's'}.`
}

function collectSharedPool(cells: MealCell[], inventory: InventoryItem[]): Set<string> {
  const counts = new Map<string, number>()
  for (const cell of cells) {
    if (!cell.meal) continue
    for (const key of mealIngredientKeys(cell.meal)) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const pool = inventoryKeys(inventory)
  for (const [key, count] of counts) {
    if (count >= 1) pool.add(key)
  }
  return pool
}

function localSwap(
  cell: MealCell,
  recipes: RetrievedRecipe[],
  sharedPool: Set<string>,
  preferences: Preferences,
  usedIds: Set<string>,
): { meal: Meal; recipe: RetrievedRecipe; reason: string } | null {
  if (!cell.meal) return null
  const current = cell.meal
  // Synthetic retrieved shape for scoring the current meal.
  const currentAsRecipe: RetrievedRecipe = {
    providerId: `current:${cell.day}:${cell.slot}`,
    name: current.name,
    ingredients: current.ingredients,
    instructions: current.instructions,
    prepMinutes: current.prepMinutes,
    cookMinutes: current.cookMinutes,
    timeIsEstimated: current.timeIsEstimated,
    imageUrl: current.imageUrl,
    sourceName: current.sourceName ?? 'Planned meal',
    sourceUrl: current.sourceUrl,
    sourcePageFetched: current.sourcePageFetched,
    cuisineHint: null,
    categoryHint: null,
  }
  const currentOverlap = overlapCount(currentAsRecipe, sharedPool)
  const currentNew = uniqueNewCount(currentAsRecipe, sharedPool)
  const currentValue = currentOverlap * 4 - currentNew

  let best: RetrievedRecipe | null = null
  let bestValue = currentValue
  let bestReason = ''

  for (const recipe of recipes) {
    if (usedIds.has(recipe.providerId)) continue
    if (!fitsMealSlot(recipe, cell.slot)) continue
    const names = recipe.ingredients.map((item) => item.name)
    if (allergyConflict(names, recipe.name, preferences.allergies)) continue
    if (dietConflict(names, recipe.name, preferences.dietary)) continue
    const cap = cell.constraint?.maxMinutes ?? null
    const minutes = totalMinutes(recipe)
    if (cap != null && minutes != null && minutes > cap) continue

    const overlap = overlapCount(recipe, sharedPool)
    const novel = uniqueNewCount(recipe, sharedPool)
    const value = overlap * 4 - novel + (overlap >= 2 ? 3 : 0)
    if (value <= bestValue) continue
    if (overlap < 1 && value <= currentValue + 2) continue
    best = recipe
    bestValue = value
    bestReason =
      overlap > currentOverlap
        ? `Reuses ${overlap} ingredient${overlap === 1 ? '' : 's'} already in this week’s plan or inventory`
        : `Fewer new grocery items than ${current.name}`
  }

  if (!best || bestValue <= currentValue) return null
  return { meal: recipeToMeal(best), recipe: best, reason: bestReason }
}

export async function optimizeWeekForShopping(input: {
  week: WeekPlan
  inventory: InventoryItem[]
  preferences: Preferences
  feedback: MealFeedback[]
  goal?: string
}): Promise<{ week: WeekPlan; reply: string; swaps: number; beforeCount: number; afterCount: number }> {
  const filled = input.week.cells.filter((cell) => cell.meal)
  const beforeRows = buildShoppingList(
    filled.map((cell) => cell.meal!),
    input.inventory,
    [],
  ).filter((row) => row.status !== 'purchased')
  const beforeCount = beforeRows.length

  if (filled.length < 2) {
    return {
      week: input.week,
      reply: 'Plan at least two meals first, then optimize so ingredients can be shared across them.',
      swaps: 0,
      beforeCount,
      afterCount: beforeCount,
    }
  }

  const seedTerms = [
    ...filled.flatMap((cell) => mealIngredientKeys(cell.meal!).slice(0, 2)),
    ...input.preferences.cuisines.slice(0, 2),
    'chicken',
    'rice',
    'pasta',
    'bean',
    'egg',
  ]
  const terms = [...new Set(seedTerms.map((term) => term.trim()).filter(Boolean))].slice(0, 10)
  const { recipes } = await retrieveRecipes(terms, input.preferences.recipeSites, {
    minCount: Math.max(filled.length + 8, 24),
  })

  let cells = input.week.cells.map((cell) => ({ ...cell }))
  let swaps = 0
  const usedIds = new Set<string>()
  let sharedPool = collectSharedPool(cells, input.inventory)
  let modelReply = ''

  // Pass 1: local overlap swaps. Leave finished meals as eaten.
  for (const cell of cells) {
    if (!cell.meal || cell.finished || cell.meal.isLeftover || cell.meal.eatingOut) continue
    const swap = localSwap(cell, recipes, sharedPool, input.preferences, usedIds)
    if (!swap) continue
    cell.meal = swap.meal
    usedIds.add(swap.recipe.providerId)
    swaps += 1
    sharedPool = collectSharedPool(cells, input.inventory)
  }

  // Pass 2: model-guided swaps when AI is configured.
  if (aiConfigured()) {
    const ranked = await optimizeWeekWithModel({
      weekCells: cells
        .filter((cell) => cell.meal)
        .map((cell) => ({
          day: cell.day,
          slot: cell.slot,
          mealName: cell.meal!.name,
          ingredients: cell.meal!.ingredients.map((item) => item.name),
        })),
      recipes,
      preferences: input.preferences,
      inventoryNames: input.inventory.map((item) => item.name),
      shoppingItemCount: beforeCount,
      goal: input.goal,
    })
    if (ranked?.reply) modelReply = ranked.reply
    if (ranked?.replacements?.length) {
      const byId = new Map(recipes.map((recipe) => [recipe.providerId, recipe]))
      for (const replacement of ranked.replacements) {
        const recipe = byId.get(replacement.providerId)
        if (!recipe) continue
        if (!fitsMealSlot(recipe, replacement.slot)) continue
        const names = recipe.ingredients.map((item) => item.name)
        if (allergyConflict(names, recipe.name, input.preferences.allergies)) continue
        if (dietConflict(names, recipe.name, input.preferences.dietary)) continue
        const index = cells.findIndex((cell) => cell.day === replacement.day && cell.slot === replacement.slot)
        if (index < 0 || !cells[index].meal || cells[index].finished || cells[index].meal!.isLeftover || cells[index].meal!.eatingOut) continue
        if (cells[index].meal!.name === recipe.name) continue
        cells[index] = { ...cells[index], meal: recipeToMeal(recipe) }
        swaps += 1
      }
    }
  }

  const afterRows = buildShoppingList(
    cells.filter((cell) => cell.meal).map((cell) => cell.meal!),
    input.inventory,
    [],
  ).filter((row) => row.status !== 'purchased')
  const afterCount = afterRows.length
  const week = { ...input.week, cells }
  const reply = [shoppingScore(beforeCount, afterCount, swaps), modelReply].filter(Boolean).join(' ')

  return { week, reply, swaps, beforeCount, afterCount }
}
