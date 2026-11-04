import type { MealSlot, Preferences, RetrievedRecipe, Weekday } from '../data/types'
import { WEEKDAYS, MEAL_SLOTS } from '../data/types'
import { aiApiKey, aiBaseUrl, aiConfigured, chatModel, extractJsonObject } from './aiConfig'

export { aiConfigured } from './aiConfig'

export interface ModelPick {
  providerId: string
  day: Weekday
  slot: MealSlot
  why: string
}

export function sanitizeReply(reply: string, allowedUrls: string[]): string {
  const allowed = new Set(allowedUrls.filter(Boolean))
  return reply
    .replace(/https?:\/\/[^\s)]+/gi, (url) => {
      const trimmed = url.replace(/[.,]+$/g, '')
      return allowed.has(trimmed) ? trimmed : ''
    })
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function isWeekday(value: string): value is Weekday {
  return WEEKDAYS.includes(value as Weekday)
}

function isSlot(value: string): value is MealSlot {
  return MEAL_SLOTS.includes(value as MealSlot)
}

export async function rankWithModel(input: {
  message: string
  recipes: RetrievedRecipe[]
  targets: { day: Weekday; slot: MealSlot }[]
  preferences: Preferences
  inventoryNames: string[]
  dayThemes?: Partial<Record<Weekday, string>>
}): Promise<{ reply: string; picks: ModelPick[] } | null> {
  const base = aiBaseUrl()
  const key = aiApiKey()
  if (!base || !key || !aiConfigured()) return null
  const model = chatModel()
  const catalog = input.recipes.map((recipe) => ({
    providerId: recipe.providerId,
    name: recipe.name,
    minutes: (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0),
    timeIsEstimated: recipe.timeIsEstimated,
    cuisine: recipe.cuisineHint,
    category: recipe.categoryHint,
    ingredients: recipe.ingredients.map((item) => item.name),
    sourceName: recipe.sourceName,
  }))

  let response: Response
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You plan meals for Planora. Choose only from the retrieved recipe catalog. Never invent recipes, URLs, or cook times. Allergies and dietary restrictions are strict. When dayThemes are provided, match each day\'s cuisine/theme as closely as the catalog allows. You MUST return exactly one pick for EVERY target cell Monday through Friday — never skip Friday or any other weekday. Never assign dessert, cake, cookies, pudding, or other sweets to breakfast, lunch, or dinner; those slots need real meals. Prefer breakfast-like dishes (eggs, oatmeal, pancakes, toast, etc.) for breakfast. Prefer distinct recipes; reuse a catalog recipe only if there are fewer recipes than targets. Whenever possible, reuse the same ingredients across multiple meals so the shopping list stays short (for example chicken in two dinners, rice with both a bowl and a side). Return JSON only: {"reply": string, "picks": [{"providerId": string, "day": string, "slot": string, "why": string}]}. Days must be monday through friday. Slots must be breakfast, lunch, or dinner. Use only the requested target cells.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              request: input.message,
              targets: input.targets,
              dayThemes: input.dayThemes ?? {},
              allergies: input.preferences.allergies,
              dietary: input.preferences.dietary,
              favorites: input.preferences.favorites,
              disliked: input.preferences.disliked,
              cuisines: input.preferences.cuisines,
              skill: input.preferences.skill,
              equipment: input.preferences.equipment,
              instructions: input.preferences.instructions,
              preferredRecipeSites: input.preferences.recipeSites,
              inventory: input.inventoryNames,
              catalog,
            }),
          },
        ],
      }),
    })
  } catch {
    return null
  }
  if (!response.ok) return null

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string | Array<{ type?: string; text?: string }> } }[]
  }
  const raw = payload.choices?.[0]?.message?.content
  const content =
    typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('\n')
        : ''
  if (!content) return null
  const jsonMatch = extractJsonObject(content)
  if (!jsonMatch) return null
  let parsed: { reply?: unknown; picks?: unknown }
  try {
    parsed = JSON.parse(jsonMatch) as { reply?: unknown; picks?: unknown }
  } catch {
    return null
  }
  const allowedIds = new Set(input.recipes.map((recipe) => recipe.providerId))
  const picks: ModelPick[] = []
  if (Array.isArray(parsed.picks)) {
    for (const pick of parsed.picks) {
      if (!pick || typeof pick !== 'object') continue
      const record = pick as Record<string, unknown>
      const providerId = String(record.providerId ?? '')
      const day = String(record.day ?? '')
      const slot = String(record.slot ?? '')
      if (!allowedIds.has(providerId) || !isWeekday(day) || !isSlot(slot)) continue
      picks.push({ providerId, day, slot, why: String(record.why ?? '').trim() })
    }
  }
  const reply = sanitizeReply(
    typeof parsed.reply === 'string' ? parsed.reply : '',
    input.recipes.map((recipe) => recipe.sourceUrl ?? ''),
  )
  return { reply, picks }
}

export async function optimizeWeekWithModel(input: {
  weekCells: { day: Weekday; slot: MealSlot; mealName: string; ingredients: string[] }[]
  recipes: RetrievedRecipe[]
  preferences: Preferences
  inventoryNames: string[]
  shoppingItemCount: number
}): Promise<{ reply: string; replacements: ModelPick[] } | null> {
  const base = aiBaseUrl()
  const key = aiApiKey()
  if (!base || !key || !aiConfigured()) return null
  const model = chatModel()
  const catalog = input.recipes.map((recipe) => ({
    providerId: recipe.providerId,
    name: recipe.name,
    category: recipe.categoryHint,
    cuisine: recipe.cuisineHint,
    ingredients: recipe.ingredients.map((item) => item.name),
  }))

  let response: Response
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You optimize an existing weekday meal plan to shorten the grocery list. Replace meals only with recipes from the catalog. Prefer swaps that reuse ingredients already used this week or present in inventory. Keep allergies and dietary restrictions strict. Do not assign desserts to breakfast, lunch, or dinner. Keep slot appropriateness (breakfast-like for breakfast). Only suggest a replacement when it clearly improves ingredient overlap. Return JSON only: {"reply": string, "replacements": [{"providerId": string, "day": string, "slot": string, "why": string}]}.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              currentPlan: input.weekCells,
              shoppingItemCount: input.shoppingItemCount,
              allergies: input.preferences.allergies,
              dietary: input.preferences.dietary,
              disliked: input.preferences.disliked,
              inventory: input.inventoryNames,
              catalog,
            }),
          },
        ],
      }),
    })
  } catch {
    return null
  }
  if (!response.ok) return null

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string | Array<{ type?: string; text?: string }> } }[]
  }
  const raw = payload.choices?.[0]?.message?.content
  const content =
    typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('\n')
        : ''
  if (!content) return null
  const jsonMatch = extractJsonObject(content)
  if (!jsonMatch) return null
  let parsed: { reply?: unknown; replacements?: unknown }
  try {
    parsed = JSON.parse(jsonMatch) as { reply?: unknown; replacements?: unknown }
  } catch {
    return null
  }
  const allowedIds = new Set(input.recipes.map((recipe) => recipe.providerId))
  const replacements: ModelPick[] = []
  if (Array.isArray(parsed.replacements)) {
    for (const item of parsed.replacements) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const providerId = String(record.providerId ?? '')
      const day = String(record.day ?? '')
      const slot = String(record.slot ?? '')
      if (!allowedIds.has(providerId) || !isWeekday(day) || !isSlot(slot)) continue
      replacements.push({ providerId, day, slot, why: String(record.why ?? '').trim() })
    }
  }
  const reply = sanitizeReply(
    typeof parsed.reply === 'string' ? parsed.reply : '',
    input.recipes.map((recipe) => recipe.sourceUrl ?? ''),
  )
  return { reply, replacements }
}

export async function suggestRunningLowWithModel(input: {
  inventory: { name: string; quantity: number; unit: string; category: string }[]
  mealIngredients: { key: string; name: string; mealCount: number }[]
  staples: string[]
  allergies: string[]
  dietary: string[]
}): Promise<{ reply: string; items: { name: string; reason: string }[] } | null> {
  const base = aiBaseUrl()
  const key = aiApiKey()
  if (!base || !key || !aiConfigured()) return null
  const model = chatModel()

  let response: Response
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You help Planora build a "running low" grocery section for common pantry staples (soy sauce, oil, salt, rice, garlic, etc.). Suggest only staples that appear depleted, low-quantity in inventory, or heavily used across this week\'s meals. Do not list fresh one-off produce unless it is a true staple like onion/garlic/lemon. Skip allergy-conflicting items. Return JSON only: {"reply": string, "items": [{"name": string, "reason": string}]}. Limit to at most 8 items.',
          },
          {
            role: 'user',
            content: JSON.stringify(input),
          },
        ],
      }),
    })
  } catch {
    return null
  }
  if (!response.ok) return null

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string | Array<{ type?: string; text?: string }> } }[]
  }
  const raw = payload.choices?.[0]?.message?.content
  const content =
    typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('\n')
        : ''
  if (!content) return null
  const jsonMatch = extractJsonObject(content)
  if (!jsonMatch) return null
  let parsed: { reply?: unknown; items?: unknown }
  try {
    parsed = JSON.parse(jsonMatch) as { reply?: unknown; items?: unknown }
  } catch {
    return null
  }
  const items: { name: string; reason: string }[] = []
  if (Array.isArray(parsed.items)) {
    for (const item of parsed.items.slice(0, 8)) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const name = String(record.name ?? '').trim()
      if (!name) continue
      items.push({ name, reason: String(record.reason ?? '').trim() })
    }
  }
  return {
    reply: typeof parsed.reply === 'string' ? parsed.reply.trim() : '',
    items,
  }
}
