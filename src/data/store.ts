import type {
  Consumption,
  InventoryItem,
  MealFeedback,
  Preferences,
  Profile,
  ProfileUpdate,
  Purchase,
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
  /** Replace the full inventory list (used after meal consumption). */
  replaceInventory(items: InventoryItem[]): Promise<void>
  getWeek(weekStart: string): Promise<WeekPlan>
  saveWeek(plan: WeekPlan): Promise<void>
  getPreferences(): Promise<Preferences>
  savePreferences(prefs: Preferences): Promise<void>
  listPurchased(weekStart: string): Promise<string[]>
  setPurchased(weekStart: string, ingredientKey: string, purchased: boolean): Promise<void>
  listPurchases(): Promise<Purchase[]>
  addPurchase(purchase: Omit<Purchase, 'id' | 'purchasedAt'> & { id?: string; purchasedAt?: string }): Promise<Purchase>
  listConsumptions(): Promise<Consumption[]>
  addConsumption(entry: Omit<Consumption, 'id' | 'finishedAt'> & { id?: string; finishedAt?: string }): Promise<Consumption>
  listFeedback(): Promise<MealFeedback[]>
  addFeedback(entry: { mealName: string; accepted: boolean }): Promise<void>
  getLastWeekStart(): Promise<string | null>
  setLastWeekStart(weekStart: string): Promise<void>
}
