import type { FoodCategory } from '../data/types'
import { FOOD_CATEGORIES, UNITS } from '../data/types'
import { aiApiKey, aiBaseUrl, aiConfigured, extractJsonObject, readApiError, visionModel } from './aiConfig'
import { guessCategory } from './ingredients'

export type ScanScene = 'receipt' | 'cart' | 'refrigerator' | 'freezer' | 'pantry' | 'other'

export interface ScannedFoodDraft {
  name: string
  quantity: number
  unit: string
  category: FoodCategory
  expiresOn: string | null
  confidence: 'high' | 'medium' | 'low'
  note?: string
}

const UNIT_SET = new Set<string>(UNITS)

function normalizeUnit(unit: string | null | undefined): string {
  const raw = (unit ?? 'piece').trim().toLowerCase()
  if (UNIT_SET.has(raw)) return raw
  const aliases: Record<string, string> = {
    pieces: 'piece',
    pcs: 'piece',
    pc: 'piece',
    each: 'piece',
    ea: 'piece',
    grams: 'g',
    gram: 'g',
    kilograms: 'kg',
    kilogram: 'kg',
    ounces: 'oz',
    ounce: 'oz',
    pounds: 'lb',
    pound: 'lb',
    milliliters: 'ml',
    millilitre: 'ml',
    millilitres: 'ml',
    liters: 'l',
    litres: 'l',
    liter: 'l',
    litre: 'l',
    teaspoon: 'tsp',
    teaspoons: 'tsp',
    tablespoon: 'tbsp',
    tablespoons: 'tbsp',
    cups: 'cup',
  }
  return aliases[raw] ?? 'piece'
}

function normalizeCategory(value: string | null | undefined, name: string): FoodCategory {
  const raw = (value ?? '').trim().toLowerCase()
  if ((FOOD_CATEGORIES as string[]).includes(raw)) return raw as FoodCategory
  return guessCategory(name)
}

export function visionConfigured(): boolean {
  return aiConfigured()
}

export async function fileToDataUrl(
  file: File,
  options?: { maxEdge?: number; quality?: number },
): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not read that image.'))
    }
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.readAsDataURL(file)
  })
  return compressDataUrl(raw, options?.maxEdge ?? 1280, options?.quality ?? 0.72)
}

/** Shrink large camera photos so Groq/OpenAI vision requests stay under size limits. */
async function compressDataUrl(dataUrl: string, maxEdge = 1280, quality = 0.72): Promise<string> {
  if (typeof document === 'undefined') return dataUrl
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
      const width = Math.max(1, Math.round(image.width * scale))
      const height = Math.max(1, Math.round(image.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(image, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    image.onerror = () => resolve(dataUrl)
    image.src = dataUrl
  })
}

export async function scanFoodPhoto(input: {
  dataUrl: string
  scene: ScanScene
}): Promise<{ items: ScannedFoodDraft[]; summary: string }> {
  const base = aiBaseUrl()
  const key = aiApiKey()
  if (!base || !key) {
    throw new Error('Add VITE_AI_BASE_URL and VITE_AI_API_KEY to enable photo scanning.')
  }
  const model = visionModel()

  const sceneHint: Record<ScanScene, string> = {
    receipt: 'This is a shopping receipt. Read purchased food lines, quantities, and units when printed.',
    cart: 'This is a shopping cart or grocery bags. Identify visible packaged and fresh foods.',
    refrigerator: 'This is inside a refrigerator. List foods you can clearly see on shelves and in bins.',
    freezer: 'This is inside a freezer. List frozen foods and packages you can clearly identify.',
    pantry: 'This is a pantry or cupboard. List dry goods and packaged foods you can identify.',
    other: 'Identify food items clearly visible in the photo.',
  }

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
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'You extract grocery inventory from photos for Planora. Only list foods you can actually see or read. Never invent brands or items that are not visible. Prefer common grocery names. Quantities may be estimated when labels are unclear. Categories must be one of: produce, meat, dairy, pantry, frozen, other. Units must be one of: g, kg, oz, lb, ml, l, tsp, tbsp, cup, piece. Return JSON only with no markdown: {"summary": string, "items":[{"name":string,"quantity":number,"unit":string,"category":string,"expiresOn":string|null,"confidence":"high"|"medium"|"low","note":string}]}',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${sceneHint[input.scene]} Return only identifiable food items useful for a home inventory. If a quantity is unclear, use 1 piece. expiresOn should be YYYY-MM-DD only when a date is readable; otherwise null.`,
              },
              {
                type: 'image_url',
                image_url: { url: input.dataUrl },
              },
            ],
          },
        ],
      }),
    })
  } catch {
    throw new Error('Could not reach the vision model. Check your connection and AI keys.')
  }

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

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
  if (!content) throw new Error('The vision model returned an empty response.')

  const jsonMatch = extractJsonObject(content)
  if (!jsonMatch) throw new Error('Could not parse food items from the photo response.')

  let parsed: { summary?: unknown; items?: unknown }
  try {
    parsed = JSON.parse(jsonMatch) as { summary?: unknown; items?: unknown }
  } catch {
    throw new Error('Could not parse food items from the photo response.')
  }

  const items: ScannedFoodDraft[] = []
  if (Array.isArray(parsed.items)) {
    for (const row of parsed.items) {
      if (!row || typeof row !== 'object') continue
      const record = row as Record<string, unknown>
      const name = String(record.name ?? '').trim()
      if (!name) continue
      const quantityRaw = Number(record.quantity)
      const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1
      const unit = normalizeUnit(typeof record.unit === 'string' ? record.unit : null)
      const category = normalizeCategory(typeof record.category === 'string' ? record.category : null, name)
      const expiresRaw = typeof record.expiresOn === 'string' ? record.expiresOn.trim() : ''
      const expiresOn = /^\d{4}-\d{2}-\d{2}$/.test(expiresRaw) ? expiresRaw : null
      const confidence =
        record.confidence === 'high' || record.confidence === 'medium' || record.confidence === 'low'
          ? record.confidence
          : 'medium'
      items.push({
        name,
        quantity,
        unit,
        category,
        expiresOn,
        confidence,
        note: typeof record.note === 'string' ? record.note : undefined,
      })
    }
  }

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : `Found ${items.length} item${items.length === 1 ? '' : 's'}.`,
    items,
  }
}
