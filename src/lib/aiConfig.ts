export type AiProvider = 'groq' | 'openai' | 'custom'

export function aiConfigured(): boolean {
  return Boolean(import.meta.env.VITE_AI_BASE_URL?.trim() && import.meta.env.VITE_AI_API_KEY?.trim())
}

export function aiBaseUrl(): string | null {
  const raw = import.meta.env.VITE_AI_BASE_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/$/, '')
}

export function aiApiKey(): string | null {
  const key = import.meta.env.VITE_AI_API_KEY?.trim()
  return key || null
}

export function detectAiProvider(baseUrl = aiBaseUrl()): AiProvider {
  if (!baseUrl) return 'custom'
  const host = baseUrl.toLowerCase()
  if (host.includes('api.groq.com')) return 'groq'
  if (host.includes('api.openai.com')) return 'openai'
  return 'custom'
}

/** Text ranking model. Groq free-tier default is openai/gpt-oss-20b. */
export function chatModel(): string {
  if (import.meta.env.VITE_AI_MODEL?.trim()) return import.meta.env.VITE_AI_MODEL.trim()
  return detectAiProvider() === 'groq' ? 'openai/gpt-oss-20b' : 'gpt-4o-mini'
}

/** Vision model for photo inventory. Groq free-tier multimodal model. */
export function visionModel(): string {
  if (import.meta.env.VITE_AI_VISION_MODEL?.trim()) return import.meta.env.VITE_AI_VISION_MODEL.trim()
  if (import.meta.env.VITE_AI_MODEL?.trim() && detectAiProvider() !== 'groq') {
    return import.meta.env.VITE_AI_MODEL.trim()
  }
  return detectAiProvider() === 'groq' ? 'qwen/qwen3.8-27b' : 'gpt-4o-mini'
}

export function extractJsonObject(text: string): string | null {
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim()

  // Prefer an object that includes picks/replacements/items.
  const preferred = cleaned.match(/\{[\s\S]*"(?:picks|replacements|items|lineItems|subtotalUsd)"[\s\S]*\}/)
  if (preferred?.[0]) {
    const candidate = preferred[0]
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      // fall through to balanced scan
    }
  }

  // Scan for the first balanced JSON object.
  const start = cleaned.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth += 1
    if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        const slice = cleaned.slice(start, i + 1)
        try {
          JSON.parse(slice)
          return slice
        } catch {
          return null
        }
      }
    }
  }
  return null
}

export async function readApiError(response: Response): Promise<string> {
  const detail = await response.text().catch(() => '')
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string }; message?: string }
    return parsed.error?.message || parsed.message || detail || `Request failed (${response.status}).`
  } catch {
    return detail || `Request failed (${response.status}).`
  }
}
