import type { DataStore } from './store'
import type {
  Consumption,
  InventoryItem,
  MealCell,
  ManualShoppingItem,
  MealFeedback,
  Preferences,
  Profile,
  ProfileUpdate,
  Purchase,
} from './types'
import { emptyPreferences, normalizePreferences } from './types'
import { createId } from '../lib/id'
import { normalizeWeek } from '../lib/meals'
import { hashPassword, verifyPassword } from '../lib/password'
import { validateEmail, validatePassword, validateUsername } from '../lib/validation'

export const LOCAL_STORAGE_KEY = 'planora.local.v1'

interface LocalAccount {
  id: string
  username: string
  email: string
  passwordHash: string
  passwordSalt: string
  avatarUrl: string | null
  tutorialCompleted: boolean
  /** Missing on older local accounts — treat as completed. */
  surveyCompleted?: boolean
  autoStartTutorial: boolean
  openOnCurrentWeek: boolean
}

interface UserBlob {
  inventory: InventoryItem[]
  weeks: Record<string, MealCell[]>
  preferences: Preferences
  purchased: Record<string, string[]>
  manualShopping: Record<string, ManualShoppingItem[]>
  purchases: Purchase[]
  consumptions: Consumption[]
  feedback: MealFeedback[]
  lastWeekStart: string | null
}

interface LocalDB {
  accounts: LocalAccount[]
  users: Record<string, UserBlob>
}

function emptyBlob(): UserBlob {
  return {
    inventory: [],
    weeks: {},
    preferences: emptyPreferences(),
    purchased: {},
    manualShopping: {},
    purchases: [],
    consumptions: [],
    feedback: [],
    lastWeekStart: null,
  }
}

function ensureBlob(blob: UserBlob): UserBlob {
  return {
    ...emptyBlob(),
    ...blob,
    purchases: Array.isArray(blob.purchases) ? blob.purchases : [],
    manualShopping: blob.manualShopping && typeof blob.manualShopping === 'object' ? blob.manualShopping : {},
    consumptions: Array.isArray(blob.consumptions) ? blob.consumptions : [],
  }
}

function readDB(): LocalDB {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return { accounts: [], users: {} }
    const parsed = JSON.parse(raw) as Partial<LocalDB>
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      users: parsed.users ?? {},
    }
  } catch {
    return { accounts: [], users: {} }
  }
}

function writeDB(db: LocalDB) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db))
}

function toProfile(account: LocalAccount): Profile {
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    avatarUrl: account.avatarUrl,
    tutorialCompleted: account.tutorialCompleted,
    // Grandfather older local accounts that predate the survey flag.
    surveyCompleted: account.surveyCompleted ?? true,
    autoStartTutorial: account.autoStartTutorial,
    openOnCurrentWeek: account.openOnCurrentWeek,
  }
}

function createLocalStore(userId: string): DataStore {
  const load = () => {
    const db = readDB()
    const account = db.accounts.find((item) => item.id === userId)
    if (!account) throw new Error('This account is no longer on this device.')
    const blob = ensureBlob(db.users[userId] ?? emptyBlob())
    return { db, account, blob }
  }

  const save = (db: LocalDB, blob: UserBlob) => {
    db.users[userId] = blob
    writeDB(db)
  }

  return {
    mode: 'local',
    async getProfile() {
      return toProfile(load().account)
    },
    async updateProfile(input: ProfileUpdate) {
      const { db, account, blob } = load()
      if (input.newPassword) {
        if (!input.currentPassword) throw new Error('Enter your current password.')
        const matches = await verifyPassword(input.currentPassword, account.passwordHash, account.passwordSalt)
        if (!matches) throw new Error('Current password is incorrect.')
        const passwordError = validatePassword(input.newPassword)
        if (passwordError) throw new Error(passwordError)
        const next = await hashPassword(input.newPassword)
        account.passwordHash = next.hash
        account.passwordSalt = next.salt
      }
      if (input.username != null) {
        const username = input.username.trim()
        const usernameError = validateUsername(username)
        if (usernameError) throw new Error(usernameError)
        const taken = db.accounts.some(
          (item) => item.id !== account.id && item.username.toLowerCase() === username.toLowerCase(),
        )
        if (taken) throw new Error('That username is taken.')
        account.username = username
      }
      if (input.email != null) {
        const email = input.email.trim().toLowerCase()
        const emailError = validateEmail(email)
        if (emailError) throw new Error(emailError)
        const taken = db.accounts.some((item) => item.id !== account.id && item.email.toLowerCase() === email)
        if (taken) throw new Error('That email is already registered.')
        account.email = email
      }
      if (input.avatarUrl !== undefined) account.avatarUrl = input.avatarUrl
      if (input.tutorialCompleted != null) account.tutorialCompleted = input.tutorialCompleted
      if (input.surveyCompleted != null) account.surveyCompleted = input.surveyCompleted
      if (input.autoStartTutorial != null) account.autoStartTutorial = input.autoStartTutorial
      if (input.openOnCurrentWeek != null) account.openOnCurrentWeek = input.openOnCurrentWeek
      save(db, blob)
      return toProfile(account)
    },
    async listInventory() {
      return load().blob.inventory
    },
    async upsertInventory(item) {
      const { db, blob } = load()
      const index = blob.inventory.findIndex((row) => row.id === item.id)
      if (index >= 0) blob.inventory[index] = item
      else blob.inventory.push(item)
      save(db, blob)
    },
    async deleteInventory(id) {
      const { db, blob } = load()
      blob.inventory = blob.inventory.filter((item) => item.id !== id)
      save(db, blob)
    },
    async replaceInventory(items) {
      const { db, blob } = load()
      blob.inventory = items.map((item) => ({ ...item }))
      save(db, blob)
    },
    async getWeek(weekStart) {
      return normalizeWeek(weekStart, load().blob.weeks[weekStart])
    },
    async saveWeek(plan) {
      const { db, blob } = load()
      blob.weeks[plan.weekStart] = plan.cells
      save(db, blob)
    },
    async getPreferences() {
      return normalizePreferences(load().blob.preferences)
    },
    async savePreferences(prefs) {
      const { db, blob } = load()
      blob.preferences = normalizePreferences(prefs)
      save(db, blob)
    },
    async listPurchased(weekStart) {
      return load().blob.purchased[weekStart] ?? []
    },
    async setPurchased(weekStart, ingredientKey, purchased) {
      const { db, blob } = load()
      const current = new Set(blob.purchased[weekStart] ?? [])
      if (purchased) current.add(ingredientKey)
      else current.delete(ingredientKey)
      blob.purchased[weekStart] = [...current]
      save(db, blob)
    },
    async listManualShopping(weekStart) {
      return [...(load().blob.manualShopping[weekStart] ?? [])]
    },
    async addManualShopping(weekStart, item) {
      const { db, blob } = load()
      const row: ManualShoppingItem = {
        id: item.id ?? createId(),
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        purchased: false,
      }
      const list = blob.manualShopping[weekStart] ?? []
      list.push(row)
      blob.manualShopping[weekStart] = list
      save(db, blob)
      return row
    },
    async setManualPurchased(id, purchased) {
      const { db, blob } = load()
      for (const week of Object.keys(blob.manualShopping)) {
        blob.manualShopping[week] = (blob.manualShopping[week] ?? []).map((item) =>
          item.id === id ? { ...item, purchased } : item,
        )
      }
      save(db, blob)
    },
    async listPurchases() {
      return [...load().blob.purchases].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt))
    },
    async addPurchase(purchase) {
      const { db, blob } = load()
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
      save(db, blob)
      return row
    },
    async listConsumptions() {
      return [...load().blob.consumptions].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    },
    async addConsumption(entry) {
      const { db, blob } = load()
      const row: Consumption = {
        id: entry.id ?? createId(),
        mealName: entry.mealName,
        day: entry.day,
        slot: entry.slot,
        weekStart: entry.weekStart,
        finishedAt: entry.finishedAt ?? new Date().toISOString(),
        items: entry.items,
        note: entry.note,
      }
      blob.consumptions.push(row)
      save(db, blob)
      return row
    },
    async listFeedback() {
      return load().blob.feedback
    },
    async addFeedback(entry) {
      const { db, blob } = load()
      blob.feedback.push({
        id: createId(),
        mealName: entry.mealName,
        accepted: entry.accepted,
        createdAt: new Date().toISOString(),
      })
      save(db, blob)
    },
    async getLastWeekStart() {
      return load().blob.lastWeekStart
    },
    async setLastWeekStart(weekStart) {
      const { db, blob } = load()
      blob.lastWeekStart = weekStart
      save(db, blob)
    },
  }
}

export async function registerLocal(input: {
  email: string
  username: string
  password: string
}): Promise<{ profile: Profile; store: DataStore }> {
  const email = input.email.trim().toLowerCase()
  const username = input.username.trim()
  const emailError = validateEmail(email)
  if (emailError) throw new Error(emailError)
  const usernameError = validateUsername(username)
  if (usernameError) throw new Error(usernameError)
  const passwordError = validatePassword(input.password)
  if (passwordError) throw new Error(passwordError)

  const db = readDB()
  if (db.accounts.some((account) => account.email.toLowerCase() === email)) {
    throw new Error('That email is already registered.')
  }
  if (db.accounts.some((account) => account.username.toLowerCase() === username.toLowerCase())) {
    throw new Error('That username is taken.')
  }
  const { hash, salt } = await hashPassword(input.password)
  const account: LocalAccount = {
    id: createId(),
    username,
    email,
    passwordHash: hash,
    passwordSalt: salt,
    avatarUrl: null,
    tutorialCompleted: false,
    surveyCompleted: false,
    autoStartTutorial: true,
    openOnCurrentWeek: true,
  }
  db.accounts.push(account)
  db.users[account.id] = emptyBlob()
  writeDB(db)
  return { profile: toProfile(account), store: createLocalStore(account.id) }
}

export async function authenticateLocal(
  identifier: string,
  password: string,
): Promise<{ profile: Profile; store: DataStore }> {
  const key = identifier.trim().toLowerCase()
  const account = readDB().accounts.find(
    (item) => item.email.toLowerCase() === key || item.username.toLowerCase() === key,
  )
  if (!account) throw new Error('No account matches that email or username.')
  const matches = await verifyPassword(password, account.passwordHash, account.passwordSalt)
  if (!matches) throw new Error('Incorrect password.')
  return { profile: toProfile(account), store: createLocalStore(account.id) }
}

export function loadLocalSession(userId: string): { profile: Profile; store: DataStore } | null {
  const account = readDB().accounts.find((item) => item.id === userId)
  if (!account) return null
  return { profile: toProfile(account), store: createLocalStore(account.id) }
}
