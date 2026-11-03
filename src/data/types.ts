export type MealSlot = 'breakfast' | 'lunch' | 'dinner'
export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday'
export type FoodCategory = 'produce' | 'meat' | 'dairy' | 'pantry' | 'frozen' | 'other'
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced'
export type StoreMode = 'local' | 'supabase' | 'demo'

export const WEEKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']
export const FOOD_CATEGORIES: FoodCategory[] = ['produce', 'meat', 'dairy', 'pantry', 'frozen', 'other']
export const UNITS = ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'piece'] as const

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
}

export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
}

export const CATEGORY_LABELS: Record<FoodCategory, string> = {
  produce: 'Produce',
  meat: 'Meat',
  dairy: 'Dairy',
  pantry: 'Pantry',
  frozen: 'Frozen',
  other: 'Other',
}

export const DEMO_PASSWORD = 'planora-demo'

export interface Profile {
  id: string
  username: string
  email: string
  avatarUrl: string | null
  tutorialCompleted: boolean
  autoStartTutorial: boolean
  openOnCurrentWeek: boolean
}

export interface ProfileUpdate {
  username?: string
  email?: string
  avatarUrl?: string | null
  tutorialCompleted?: boolean
  autoStartTutorial?: boolean
  openOnCurrentWeek?: boolean
  currentPassword?: string
  newPassword?: string
}

export interface InventoryItem {
  id: string
  name: string
  quantity: number
  unit: string
  expiresOn: string | null
  category: FoodCategory
}

export interface Ingredient {
  name: string
  quantity: number | null
  unit: string | null
}

export interface Meal {
  id: string
  name: string
  ingredients: Ingredient[]
  instructions: string[]
  prepMinutes: number | null
  cookMinutes: number | null
  timeIsEstimated: boolean
  imageUrl: string | null
  sourceName: string | null
  sourceUrl: string | null
  sourceRetrieved: boolean
  sourcePageFetched: boolean
}

export interface TimeConstraint {
  maxMinutes: number | null
  note: string
}

export interface MealCell {
  day: Weekday
  slot: MealSlot
  meal: Meal | null
  constraint: TimeConstraint | null
}

export interface WeekPlan {
  weekStart: string
  cells: MealCell[]
}

export interface Preferences {
  allergies: string[]
  dietary: string[]
  favorites: string[]
  disliked: string[]
  cuisines: string[]
  skill: SkillLevel
  equipment: string[]
  /** Publisher ids from RECIPE_PUBLISHERS, e.g. recipetineats, justonecookbook */
  recipeSites: string[]
  instructions: string
}

export interface MealFeedback {
  id: string
  mealName: string
  accepted: boolean
  createdAt: string
}

export interface RetrievedRecipe {
  providerId: string
  name: string
  ingredients: Ingredient[]
  instructions: string[]
  prepMinutes: number | null
  cookMinutes: number | null
  timeIsEstimated: boolean
  imageUrl: string | null
  sourceName: string
  sourceUrl: string | null
  sourcePageFetched: boolean
  cuisineHint: string | null
}

export function emptyPreferences(): Preferences {
  return {
    allergies: [],
    dietary: [],
    favorites: [],
    disliked: [],
    cuisines: [],
    skill: 'beginner',
    equipment: ['stovetop', 'oven'],
    recipeSites: [],
    instructions: '',
  }
}

export function normalizePreferences(value: Partial<Preferences> | null | undefined): Preferences {
  const base = emptyPreferences()
  if (!value) return base
  return {
    allergies: Array.isArray(value.allergies) ? value.allergies : base.allergies,
    dietary: Array.isArray(value.dietary) ? value.dietary : base.dietary,
    favorites: Array.isArray(value.favorites) ? value.favorites : base.favorites,
    disliked: Array.isArray(value.disliked) ? value.disliked : base.disliked,
    cuisines: Array.isArray(value.cuisines) ? value.cuisines : base.cuisines,
    skill: value.skill === 'intermediate' || value.skill === 'advanced' ? value.skill : 'beginner',
    equipment: Array.isArray(value.equipment) ? value.equipment : base.equipment,
    recipeSites: Array.isArray(value.recipeSites) ? value.recipeSites : base.recipeSites,
    instructions: typeof value.instructions === 'string' ? value.instructions : base.instructions,
  }
}
