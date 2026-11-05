import type { User } from '@supabase/supabase-js'
import { createId } from '../lib/id'
import { normalizeWeek } from '../lib/meals'
import { supabase } from '../lib/supabaseClient'
import { validateEmail, validatePassword, validateUsername } from '../lib/validation'
import type { DataStore } from './store'
import {
  addLedgerConsumption,
  addLedgerPurchase,
  listLedgerConsumptions,
  listLedgerPurchases,
} from './ledgerStorage'
import type {
  Consumption,
  FoodCategory,
  InventoryItem,
  Meal,
  MealCell,
  MealFeedback,
  MealSlot,
  Preferences,
  Profile,
  ProfileUpdate,
  Purchase,
  SkillLevel,
  TimeConstraint,
  Weekday,
} from './types'
import { emptyPreferences, normalizePreferences } from './types'

interface ProfileRow {
  id: string
  username: string
  email: string
  avatar_url: string | null
  tutorial_completed: boolean
  survey_completed?: boolean | null
  auto_start_tutorial: boolean
  open_on_current_week: boolean
  last_week_start: string | null
}

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    avatarUrl: row.avatar_url,
    tutorialCompleted: row.tutorial_completed,
    // Missing column (pre-migration) → treat as completed.
    surveyCompleted: Boolean(row.survey_completed ?? true),
    autoStartTutorial: row.auto_start_tutorial,
    openOnCurrentWeek: row.open_on_current_week,
  }
}

async function readProfile(userId: string): Promise<ProfileRow> {
  const client = requireClient()
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle()
  fail(error)
  if (!data) throw new Error('Profile not found')
  return data as ProfileRow
}

export async function loadSupabaseProfile(user: User): Promise<{ profile: Profile; store: DataStore }> {
  const store = createSupabaseStore(user.id)
  try {
    const profile = await store.getProfile()
    return { profile, store }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.toLowerCase().includes('profile not found')) throw error
  }
  const client = requireClient()
  const username = String(user.user_metadata?.username ?? user.email?.split('@')[0] ?? 'member')
  const { error } = await client.from('profiles').insert({
    id: user.id,
    username,
    email: user.email ?? '',
    survey_completed: false,
  })
  fail(error)
  return { profile: await store.getProfile(), store }
}

export function createSupabaseStore(userId: string): DataStore {
  return {
    mode: 'supabase',
    async getProfile() {
      return toProfile(await readProfile(userId))
    },
    async updateProfile(input: ProfileUpdate) {
      const client = requireClient()
      const current = await readProfile(userId)
      if (input.newPassword) {
        if (!input.currentPassword) throw new Error('Enter your current password.')
        const passwordError = validatePassword(input.newPassword)
        if (passwordError) throw new Error(passwordError)
        const email = current.email
        const { error: reauthError } = await client.auth.signInWithPassword({
          email,
          password: input.currentPassword,
        })
        if (reauthError) throw new Error('Current password is incorrect.')
        const { error } = await client.auth.updateUser({ password: input.newPassword })
        fail(error)
      }
      if (input.email && input.email.trim().toLowerCase() !== current.email.toLowerCase()) {
        const email = input.email.trim().toLowerCase()
        const emailError = validateEmail(email)
        if (emailError) throw new Error(emailError)
        const { error } = await client.auth.updateUser({ email })
        fail(error)
      }
      if (input.username != null) {
        const usernameError = validateUsername(input.username.trim())
        if (usernameError) throw new Error(usernameError)
      }
      const patch: Record<string, unknown> = {}
      if (input.username != null) patch.username = input.username.trim()
      if (input.email != null) patch.email = input.email.trim().toLowerCase()
      if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl
      if (input.tutorialCompleted != null) patch.tutorial_completed = input.tutorialCompleted
      if (input.surveyCompleted != null) patch.survey_completed = input.surveyCompleted
      if (input.autoStartTutorial != null) patch.auto_start_tutorial = input.autoStartTutorial
      if (input.openOnCurrentWeek != null) patch.open_on_current_week = input.openOnCurrentWeek
      if (Object.keys(patch).length) {
        const { error } = await client.from('profiles').update(patch).eq('id', userId)
        fail(error)
      }
      return toProfile(await readProfile(userId))
    },
    async listInventory() {
      const client = requireClient()
      const { data, error } = await client.from('inventory_items').select('*').eq('user_id', userId).order('name')
      fail(error)
      return (data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        quantity: Number(row.quantity),
        unit: String(row.unit),
        expiresOn: row.expires_on ? String(row.expires_on) : null,
        category: row.category as FoodCategory,
      }))
    },
    async upsertInventory(item: InventoryItem) {
      const client = requireClient()
      const { error } = await client.from('inventory_items').upsert({
        id: item.id,
        user_id: userId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        expires_on: item.expiresOn,
        category: item.category,
      })
      fail(error)
    },
    async deleteInventory(id: string) {
      const client = requireClient()
      const { error } = await client.from('inventory_items').delete().eq('id', id).eq('user_id', userId)
      fail(error)
    },
    async replaceInventory(items: InventoryItem[]) {
      const client = requireClient()
      const { data, error } = await client.from('inventory_items').select('id').eq('user_id', userId)
      fail(error)
      const nextIds = new Set(items.map((item) => item.id))
      for (const row of data ?? []) {
        if (!nextIds.has(String(row.id))) {
          const { error: deleteError } = await client
            .from('inventory_items')
            .delete()
            .eq('id', row.id)
            .eq('user_id', userId)
          fail(deleteError)
        }
      }
      for (const item of items) {
        const { error: upsertError } = await client.from('inventory_items').upsert({
          id: item.id,
          user_id: userId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          expires_on: item.expiresOn,
          category: item.category,
        })
        fail(upsertError)
      }
    },
    async getWeek(weekStart: string) {
      const client = requireClient()
      const { data, error } = await client
        .from('meal_slots')
        .select('*')
        .eq('user_id', userId)
        .eq('week_start', weekStart)
      fail(error)
      const cells = (data ?? []).map((row) => ({
        day: row.day as Weekday,
        slot: row.slot as MealSlot,
        meal: (row.meal as Meal | null) ?? null,
        constraint: (row.time_constraint as TimeConstraint | null) ?? null,
        finished: Boolean(row.finished),
      }))
      return normalizeWeek(weekStart, cells)
    },
    async saveWeek(plan) {
      const client = requireClient()
      const rows = plan.cells.map((cell: MealCell) => ({
        id: createId(),
        user_id: userId,
        week_start: plan.weekStart,
        day: cell.day,
        slot: cell.slot,
        meal: cell.meal,
        time_constraint: cell.constraint,
        finished: Boolean(cell.finished),
      }))
      const { error } = await client.from('meal_slots').upsert(rows, { onConflict: 'user_id,week_start,day,slot' })
      // Older schemas without `finished` — retry without the column.
      if (error && /finished/i.test(error.message)) {
        const legacy = rows.map(({ finished: _f, ...rest }) => rest)
        const { error: retryError } = await client
          .from('meal_slots')
          .upsert(legacy, { onConflict: 'user_id,week_start,day,slot' })
        fail(retryError)
        return
      }
      fail(error)
    },
    async getPreferences() {
      const client = requireClient()
      const { data, error } = await client.from('preferences').select('*').eq('user_id', userId).maybeSingle()
      fail(error)
      if (!data) return emptyPreferences()
      return normalizePreferences({
        allergies: data.allergies ?? [],
        dietary: data.dietary ?? [],
        favorites: data.favorites ?? [],
        disliked: data.disliked ?? [],
        cuisines: data.cuisines ?? [],
        skill: (data.skill as SkillLevel) ?? 'beginner',
        equipment: data.equipment ?? [],
        recipeSites: Array.isArray(data.recipe_sites) ? data.recipe_sites : [],
        instructions: data.instructions ?? '',
      })
    },
    async savePreferences(prefs: Preferences) {
      const client = requireClient()
      const normalized = normalizePreferences(prefs)
      const { error } = await client.from('preferences').upsert({
        user_id: userId,
        allergies: normalized.allergies,
        dietary: normalized.dietary,
        favorites: normalized.favorites,
        disliked: normalized.disliked,
        cuisines: normalized.cuisines,
        skill: normalized.skill,
        equipment: normalized.equipment,
        recipe_sites: normalized.recipeSites,
        instructions: normalized.instructions,
      })
      fail(error)
    },
    async listPurchased(weekStart: string) {
      const client = requireClient()
      const { data, error } = await client
        .from('shopping_items')
        .select('ingredient_key, purchased')
        .eq('user_id', userId)
        .eq('week_start', weekStart)
        .eq('purchased', true)
      fail(error)
      return (data ?? []).map((row) => String(row.ingredient_key))
    },
    async setPurchased(weekStart: string, ingredientKey: string, purchased: boolean) {
      const client = requireClient()
      const { data, error } = await client
        .from('shopping_items')
        .select('id')
        .eq('user_id', userId)
        .eq('week_start', weekStart)
        .eq('ingredient_key', ingredientKey)
        .maybeSingle()
      fail(error)
      if (data?.id) {
        const { error: updateError } = await client.from('shopping_items').update({ purchased }).eq('id', data.id)
        fail(updateError)
        return
      }
      const { error: insertError } = await client.from('shopping_items').insert({
        id: createId(),
        user_id: userId,
        week_start: weekStart,
        ingredient_key: ingredientKey,
        purchased,
      })
      fail(insertError)
    },
    async listPurchases() {
      return listLedgerPurchases(userId)
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
      return addLedgerPurchase(userId, row)
    },
    async listConsumptions() {
      return listLedgerConsumptions(userId)
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
        note: entry.note,
      }
      return addLedgerConsumption(userId, row)
    },
    async listFeedback() {
      const client = requireClient()
      const { data, error } = await client
        .from('meal_feedback')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      fail(error)
      return (data ?? []).map(
        (row): MealFeedback => ({
          id: String(row.id),
          mealName: String(row.meal_name),
          accepted: Boolean(row.accepted),
          createdAt: String(row.created_at),
        }),
      )
    },
    async addFeedback(entry) {
      const client = requireClient()
      const { error } = await client.from('meal_feedback').insert({
        id: createId(),
        user_id: userId,
        meal_name: entry.mealName,
        accepted: entry.accepted,
      })
      fail(error)
    },
    async getLastWeekStart() {
      const row = await readProfile(userId)
      return row.last_week_start
    },
    async setLastWeekStart(weekStart: string) {
      const client = requireClient()
      const { error } = await client.from('profiles').update({ last_week_start: weekStart }).eq('id', userId)
      fail(error)
    },
  }
}
