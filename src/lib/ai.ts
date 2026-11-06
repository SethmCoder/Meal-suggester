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
  foodFocus?: string[]
  mustUseFoods?: string[]
  likedFoods?: string[]
  timeCaps?: { day: Weekday; slot: MealSlot; maxMinutes: number }[]
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

  const targetCount = input.targets.length
  const system = [
    'You plan meals for Planora.',
    'Choose only from the retrieved recipe catalog. Never invent recipes, URLs, or cook times.',
    'Allergies and dietary restrictions are strict hard filters.',
    'Return exactly one pick for every listed target cell — no more, no fewer when the catalog allows.',
    'Only use day/slot pairs present in targets. Do not invent extra days.',
    'Never assign dessert/sweets to breakfast, lunch, or dinner.',
    'If likedFoods are provided, prefer catalog recipes that share those foods when they still fit the slot.',
    'mustUseFoods are items the cook already owns and needs to eat soon (freezer food or food that is expiring). Use them before suggesting meals that ignore them.',
    'Do not claim recipes came from Instagram. Only use the retrieved catalog.',
    'For breakfast targets, prefer egg dishes, oatmeal, pancakes, toast, and similar breakfast foods when requested or appropriate.',
    'When dayThemes are provided, match them as well as the catalog allows.',
    'Prefer distinct recipes; reuse a recipe only when no unused fitting recipe remains.',
    'Do not assign breakfast dishes to lunch or dinner when another fitting recipe is in the catalog.',
    'Reuse shared ingredients across meals when useful for shopping.',
    'Optimize for store package sizes: if one meal uses 1 egg, prefer later meals that use more eggs so a dozen is mostly consumed instead of wasted.',
    'Same idea for milk, chicken packs, rice bags, onions, etc. Fill opened packages across the week.',
    'timeCaps are hard limits on prep plus cook minutes. Never pick a catalog recipe whose minutes exceed the cap for that day and slot.',
    'Each why must be one or two sentences explaining the choice: inventory, time limit, cuisine, diet, package use, or a similar reason.',
    'Return JSON only: {"reply": string, "picks": [{"providerId": string, "day": string, "slot": string, "why": string}]}.',
  ].join(' ')

  const body: Record<string, unknown> = {
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: JSON.stringify({
          request: input.message,
          foodFocus: input.foodFocus ?? [],
          mustUseFoods: input.mustUseFoods ?? [],
          likedFoods: input.likedFoods ?? [],
          targets: input.targets,
          targetCount,
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
          timeCaps: input.timeCaps ?? [],
          catalog,
        }),
      },
    ],
  }
  // Helps many OpenAI-compatible providers return valid JSON.
  body.response_format = { type: 'json_object' }

  let response: Response
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    return null
  }

  // Some models reject response_format — retry once without it.
  if (!response.ok && response.status === 400) {
    delete body.response_format
    try {
      response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch {
      return null
    }
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
  const allowedTargets = new Set(input.targets.map((cell) => `${cell.day}:${cell.slot}`))
  const picks: ModelPick[] = []
  if (Array.isArray(parsed.picks)) {
    for (const pick of parsed.picks) {
      if (!pick || typeof pick !== 'object') continue
      const record = pick as Record<string, unknown>
      const providerId = String(record.providerId ?? '')
      const day = String(record.day ?? '').toLowerCase()
      const slot = String(record.slot ?? '').toLowerCase()
      if (!allowedIds.has(providerId) || !isWeekday(day) || !isSlot(slot)) continue
      if (!allowedTargets.has(`${day}:${slot}`)) continue
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
  goal?: string
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
              'You optimize an existing weekday meal plan to shorten the grocery list and lower how many ingredients must be bought. Replace meals only with recipes from the catalog. Prefer swaps that reuse ingredients already used this week or present in inventory. If the shopper wrote a goal, follow it when the catalog allows. Keep allergies and dietary restrictions strict. Do not assign desserts to breakfast, lunch, or dinner. Keep slot appropriateness (breakfast-like for breakfast). Only suggest a replacement when it clearly reduces new ingredients. Return JSON only: {"reply": string, "replacements": [{"providerId": string, "day": string, "slot": string, "why": string}]}.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              currentPlan: input.weekCells,
              shoppingItemCount: input.shoppingItemCount,
              shopperGoal: input.goal ?? '',
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
