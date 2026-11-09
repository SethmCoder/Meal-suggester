import type { MealSlot, RetrievedRecipe } from '../data/types'

const DESSERT_RE =
  /\b(cake|cakes|cookie|cookies|brownie|brownies|ice cream|pudding|dessert|cupcake|cheesecake|tiramisu|fudge|candy|trifle|parfait|sorbet|gelato|macaron|doughnut|donut|churro|baklava|souffle|soufflé|apple crisp|cobbler|crumble|strudel|torte|gateau|gâteau|eclair|éclair|cannoli|blondie|biscotti|shortbread|meringue|brulee|brûlée|banoffee|frangipane|frangipan|bakewell|flapjack|mochi|halva|baklava)\b/i

const DESSERT_PIE_RE =
  /\b((apple|cherry|pecan|pumpkin|key lime|banoffee|lemon meringue|sweet potato|peach|blueberry|berry|chocolate|custard|cream)\s+pie|pie)\b/i

const SAVORY_PIE_RE =
  /\b(shepherd|cottage|pot|meat|chicken|steak|beef|fish|pork|turkey|vegetable|veggie|sausage|kidney)\b/i

const SWEET_COURSE_RE =
  /\b(pastry|pastries|tart|tarts|muffin|muffins|scone|scones|cinnamon roll|sweet roll|danish|croissant|pancake|pancakes|waffle|waffles|french toast|crepe|crêpe|crepes|crêpes|doughnut|donut|churro|cookie|cookies|brownie|cake|cupcake|cheesecake)\b/i

const BREAKFAST_RE =
  /\b(egg|eggs|omelet|omelette|pancake|pancakes|waffle|waffles|toast|breakfast|granola|oatmeal|porridge|bagel|cereal|frittata|scramble|scrambled|yogurt|smoothie|shakshuka|french toast|breakfast burrito|muesli)\b/i

function haystack(recipe: RetrievedRecipe): string {
  return `${recipe.name} ${recipe.categoryHint ?? ''} ${recipe.cuisineHint ?? ''}`
}

export function dessertLike(recipe: RetrievedRecipe): boolean {
  const category = (recipe.categoryHint ?? '').toLowerCase()
  if (category === 'dessert') return true
  if (category.includes('dessert') || category.includes('sweet')) return true
  const text = haystack(recipe)
  if (DESSERT_RE.test(text)) return true
  if (DESSERT_PIE_RE.test(recipe.name) && !SAVORY_PIE_RE.test(recipe.name)) return true
  return false
}

/** Sweet dishes that should not be a main lunch or dinner, including breakfast pastries. */
export function sweetCourseLike(recipe: RetrievedRecipe): boolean {
  if (dessertLike(recipe)) return true
  const category = (recipe.categoryHint ?? '').toLowerCase()
  if (category.includes('dessert') || category.includes('sweet')) return true
  return SWEET_COURSE_RE.test(haystack(recipe))
}

export function breakfastLike(recipe: RetrievedRecipe): boolean {
  const category = (recipe.categoryHint ?? '').toLowerCase()
  if (category === 'breakfast') return true
  if (category.includes('breakfast')) return true
  return BREAKFAST_RE.test(recipe.name)
}

/** Hard reject desserts always; also reject sweet courses as lunch/dinner mains. */
export function fitsMealSlot(recipe: RetrievedRecipe, slot: MealSlot): boolean {
  if (dessertLike(recipe)) return false
  if ((slot === 'lunch' || slot === 'dinner') && sweetCourseLike(recipe)) return false
  return true
}

/** Extra ranking points for slot appropriateness. */
export function slotScore(recipe: RetrievedRecipe, slot: MealSlot): { delta: number; reason?: string } {
  if (dessertLike(recipe) || ((slot === 'lunch' || slot === 'dinner') && sweetCourseLike(recipe))) {
    return { delta: -100, reason: 'Skipped dessert or sweet dish for a main meal slot' }
  }
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
