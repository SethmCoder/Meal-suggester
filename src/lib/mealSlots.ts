import type { MealSlot, RetrievedRecipe } from '../data/types'

const DESSERT_RE =
  /\b(cake|cakes|cookie|cookies|brownie|brownies|ice cream|pudding|dessert|cupcake|cheesecake|tiramisu|fudge|candy|trifle|parfait|sorbet|gelato|macaron|doughnut|donut|churro|baklava|souffle|soufflé|sweet potato pie|apple crisp|cobbler)\b/i

const BREAKFAST_RE =
  /\b(egg|eggs|omelet|omelette|pancake|pancakes|waffle|waffles|toast|breakfast|granola|oatmeal|porridge|bagel|cereal|frittata|scramble|scrambled|yogurt|smoothie|shakshuka|french toast|breakfast burrito|muesli)\b/i

export function dessertLike(recipe: RetrievedRecipe): boolean {
  const category = (recipe.categoryHint ?? '').toLowerCase()
  if (category === 'dessert') return true
  if (category.includes('dessert') || category.includes('sweet')) return true
  return DESSERT_RE.test(recipe.name)
}

export function breakfastLike(recipe: RetrievedRecipe): boolean {
  const category = (recipe.categoryHint ?? '').toLowerCase()
  if (category === 'breakfast') return true
  if (category.includes('breakfast')) return true
  return BREAKFAST_RE.test(recipe.name)
}

/** Hard reject desserts as main breakfast/lunch/dinner meals. */
export function fitsMealSlot(recipe: RetrievedRecipe, _slot: MealSlot): boolean {
  return !dessertLike(recipe)
}

/** Extra ranking points for slot appropriateness. */
export function slotScore(recipe: RetrievedRecipe, slot: MealSlot): { delta: number; reason?: string } {
  if (dessertLike(recipe)) return { delta: -100, reason: 'Skipped dessert for a main meal slot' }
  if (slot === 'breakfast') {
    if (breakfastLike(recipe)) return { delta: 24, reason: 'Fits breakfast' }
    if ((recipe.categoryHint ?? '').toLowerCase() === 'side') return { delta: -8 }
    return { delta: -4 }
  }
  if (slot === 'lunch' || slot === 'dinner') {
    if (breakfastLike(recipe)) {
      return { delta: -18, reason: 'Less ideal as a main lunch/dinner' }
    }
    return { delta: 0 }
  }
  return { delta: 0 }
}
