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
              'You plan meals for Planora. Choose only from the retrieved recipe catalog. Never invent recipes, URLs, or cook times. Allergies and dietary restrictions are strict. When dayThemes are provided, match each day\'s cuisine/theme as closely as the catalog allows and vary picks across the week. Fill every target cell you can with distinct recipes. Return JSON only: {"reply": string, "picks": [{"providerId": string, "day": string, "slot": string, "why": string}]}. Days must be monday through friday. Slots must be breakfast, lunch, or dinner. Use only the requested target cells.',
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
