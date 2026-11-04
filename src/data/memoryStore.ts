import { addDays, todayISO } from '../lib/dates'
import { createId } from '../lib/id'
import { normalizeWeek } from '../lib/meals'
import type { DataStore } from './store'
import type {
  Consumption,
  InventoryItem,
  MealCell,
  MealFeedback,
  Preferences,
  Profile,
  ProfileUpdate,
  Purchase,
} from './types'
import { DEMO_PASSWORD, emptyPreferences, normalizePreferences } from './types'
import { validateEmail, validateUsername } from '../lib/validation'

interface MemoryBlob {
  inventory: InventoryItem[]
  weeks: Record<string, MealCell[]>
  preferences: Preferences
  purchased: Record<string, string[]>
  purchases: Purchase[]
  consumptions: Consumption[]
  feedback: MealFeedback[]
  lastWeekStart: string | null
}

function demoInventory(): InventoryItem[] {
  const today = todayISO()
  return [
    { id: 'demo-eggs', name: 'Eggs', quantity: 12, unit: 'piece', expiresOn: addDays(today, 10), category: 'dairy' },
    { id: 'demo-spinach', name: 'Spinach', quantity: 1, unit: 'piece', expiresOn: addDays(today, 2), category: 'produce' },
    { id: 'demo-rice', name: 'Rice', quantity: 1, unit: 'kg', expiresOn: null, category: 'pantry' },
    { id: 'demo-chicken', name: 'Chicken breast', quantity: 500, unit: 'g', expiresOn: addDays(today, 1), category: 'meat' },
    { id: 'demo-milk', name: 'Milk', quantity: 1, unit: 'l', expiresOn: addDays(today, -1), category: 'dairy' },
    { id: 'demo-peas', name: 'Frozen peas', quantity: 400, unit: 'g', expiresOn: addDays(today, 60), category: 'frozen' },
  ]
}

export function createDemoSession(): { profile: Profile; store: DataStore } {
  const profile: Profile = {
    id: 'demo-user',
    username: 'demo',
    email: 'demo@planora.app',
    avatarUrl: null,
    tutorialCompleted: false,
    surveyCompleted: true,
    autoStartTutorial: true,
    openOnCurrentWeek: true,
  }
  const blob: MemoryBlob = {
    inventory: demoInventory(),
    weeks: {},
    preferences: emptyPreferences(),
    purchased: {},
    purchases: [],
    consumptions: [],
    feedback: [],
    lastWeekStart: null,
  }

  const store: DataStore = {
    mode: 'demo',
    async getProfile() {
      return { ...profile }
    },
    async updateProfile(input: ProfileUpdate) {
      if (input.newPassword) {
        throw new Error(`The demo sign-in password stays ${DEMO_PASSWORD}. Other settings in this session can still be changed.`)
      }
      if (input.username != null) {
        const username = input.username.trim()
        const usernameError = validateUsername(username)
        if (usernameError) throw new Error(usernameError)
        profile.username = username
      }
      if (input.email != null) {
        const email = input.email.trim().toLowerCase()
        const emailError = validateEmail(email)
        if (emailError) throw new Error(emailError)
        profile.email = email
      }
      if (input.avatarUrl !== undefined) profile.avatarUrl = input.avatarUrl
      if (input.tutorialCompleted != null) profile.tutorialCompleted = input.tutorialCompleted
      if (input.surveyCompleted != null) profile.surveyCompleted = input.surveyCompleted
      if (input.autoStartTutorial != null) profile.autoStartTutorial = input.autoStartTutorial
      if (input.openOnCurrentWeek != null) profile.openOnCurrentWeek = input.openOnCurrentWeek
      return { ...profile }
    },
    async listInventory() {
      return blob.inventory.map((item) => ({ ...item }))
    },
    async upsertInventory(item) {
      const index = blob.inventory.findIndex((row) => row.id === item.id)
      if (index >= 0) blob.inventory[index] = item
      else blob.inventory.push(item)
    },
    async deleteInventory(id) {
      blob.inventory = blob.inventory.filter((item) => item.id !== id)
    },
    async replaceInventory(items) {
      blob.inventory = items.map((item) => ({ ...item }))
    },
    async getWeek(weekStart) {
      return normalizeWeek(weekStart, blob.weeks[weekStart])
    },
    async saveWeek(plan) {
      blob.weeks[plan.weekStart] = plan.cells
    },
    async getPreferences() {
      return normalizePreferences(blob.preferences)
    },
    async savePreferences(prefs) {
      blob.preferences = normalizePreferences(prefs)
    },
    async listPurchased(weekStart) {
      return [...(blob.purchased[weekStart] ?? [])]
    },
    async setPurchased(weekStart, ingredientKey, purchased) {
      const current = new Set(blob.purchased[weekStart] ?? [])
      if (purchased) current.add(ingredientKey)
      else current.delete(ingredientKey)
      blob.purchased[weekStart] = [...current]
    },
    async listPurchases() {
      return [...blob.purchases].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt))
    },
    async addPurchase(purchase) {
      const row: Purchase = {
        id: purchase.id ?? createId(),
        name: purchase.name,
        quantity: purchase.quantity,
        unit: purchase.unit,
        estimatedCostUsd: purchase.estimatedCostUsd,
        purchasedAt: purchase.purchasedAt ?? new Date().toISOString(),
        source: purchase.source,
        ingredientKey: purchase.ingredientKey,
      }
      blob.purchases.push(row)
      return row
    },
    async listConsumptions() {
      return [...blob.consumptions].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    },
    async addConsumption(entry) {
      const row: Consumption = {
        id: entry.id ?? createId(),
        mealName: entry.mealName,
        day: entry.day,
        slot: entry.slot,
        weekStart: entry.weekStart,
        finishedAt: entry.finishedAt ?? new Date().toISOString(),
        items: entry.items,
      }
      blob.consumptions.push(row)
      return row
    },
    async listFeedback() {
      return [...blob.feedback]
    },
    async addFeedback(entry) {
      blob.feedback.push({
        id: createId(),
        mealName: entry.mealName,
        accepted: entry.accepted,
        createdAt: new Date().toISOString(),
      })
    },
    async getLastWeekStart() {
      return blob.lastWeekStart
    },
    async setLastWeekStart(weekStart) {
      blob.lastWeekStart = weekStart
    },
  }

  return { profile: { ...profile }, store }
}
