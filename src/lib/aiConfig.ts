export type AiProvider = 'groq' | 'openai' | 'custom'

function readEnv(name: string): string {
  const viteEnv = import.meta.env as Record<string, string | undefined>
  const fromVite = viteEnv?.[name]
  if (typeof fromVite === 'string' && fromVite.trim()) return fromVite.trim()
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  return proc?.env?.[name]?.trim() ?? ''
}

export function aiConfigured(): boolean {
  return Boolean(readEnv('VITE_AI_BASE_URL') && readEnv('VITE_AI_API_KEY'))
}

export function aiBaseUrl(): string | null {
  const raw = readEnv('VITE_AI_BASE_URL')
  if (!raw) return null
  return raw.replace(/\/$/, '')
}

export function aiApiKey(): string | null {
  return readEnv('VITE_AI_API_KEY') || null
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
  const configured = readEnv('VITE_AI_MODEL')
  if (configured) return configured
  return detectAiProvider() === 'groq' ? 'openai/gpt-oss-20b' : 'gpt-4o-mini'
}

/** Vision model for photo inventory. Groq free-tier multimodal model. */
export function visionModel(): string {
  const vision = readEnv('VITE_AI_VISION_MODEL')
  if (vision) return vision
  const text = readEnv('VITE_AI_MODEL')
  if (text && detectAiProvider() !== 'groq') return text
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
