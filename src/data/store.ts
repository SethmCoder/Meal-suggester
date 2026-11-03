import type {
  InventoryItem,
  MealFeedback,
  Preferences,
  Profile,
  ProfileUpdate,
  StoreMode,
  WeekPlan,
} from './types'

export interface DataStore {
  readonly mode: StoreMode
  getProfile(): Promise<Profile>
  updateProfile(input: ProfileUpdate): Promise<Profile>
  listInventory(): Promise<InventoryItem[]>
  upsertInventory(item: InventoryItem): Promise<void>
  deleteInventory(id: string): Promise<void>
  getWeek(weekStart: string): Promise<WeekPlan>
  saveWeek(plan: WeekPlan): Promise<void>
  getPreferences(): Promise<Preferences>
  savePreferences(prefs: Preferences): Promise<void>
  listPurchased(weekStart: string): Promise<string[]>
  setPurchased(weekStart: string, ingredientKey: string, purchased: boolean): Promise<void>
  listFeedback(): Promise<MealFeedback[]>
  addFeedback(entry: { mealName: string; accepted: boolean }): Promise<void>
  getLastWeekStart(): Promise<string | null>
  setLastWeekStart(weekStart: string): Promise<void>
}
