/**
 * Local recipe scrape helpers for preferred publisher sites.
 * Fetches public HTML and reads schema.org Recipe JSON-LD when present.
 * Best-effort: many sites block bots or omit structured data.
 */

export interface ScrapedIngredient {
  name: string
  quantity: number | null
  unit: string | null
}

export interface ScrapedRecipe {
  providerId: string
  name: string
  ingredients: ScrapedIngredient[]
  instructions: string[]
  prepMinutes: number | null
  cookMinutes: number | null
  timeIsEstimated: boolean
  imageUrl: string | null
  sourceName: string
  sourceUrl: string
  sourcePageFetched: boolean
  cuisineHint: string | null
}

export interface PublisherScrapeTarget {
  id: string
  name: string
  domains: string[]
  searchUrlTemplate: string | null
}

const UA =
  'PlanoraMealPlanner/1.0 (+local recipe JSON-LD; personal meal planning; respectful fetch)'

const SKIP_PATH =
  /\/(tag|tags|category|categories|author|authors|search|page\/\d+|wp-|cart|login|account|privacy|about|contact|newsletter|shop|product|collections?|cuisine|course|diet|method|occasion|ingredient|content\/|feed|cookbooks?|recipes\/?$|comments\/feed|policy|free-recipe)(\/|$)/i

const SKIP_EXT =
  /\.(svg|png|jpe?g|gif|webp|ico|css|js|mjs|map|woff2?|ttf|eot|xml|json|mp4|webm|pdf)(\?|$)/i

function hashId(url: string): string {
  let hash = 0
  for (let i = 0; i < url.length; i += 1) hash = (hash * 31 + url.charCodeAt(i)) | 0
  return `scrape:${Math.abs(hash).toString(36)}`
}

function buildSearchUrl(template: string, query: string): string {
  return template.replace(/\{q\}/g, encodeURIComponent(query))
}

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    })
    if (!response.ok) return null
    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('text/html') && !type.includes('application/xhtml')) {
      // Some sites omit content-type; still try if body looks like HTML later.
      if (type && !type.includes('text/plain')) return null
    }
    return await response.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const raw = match[1]
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim()
    if (!raw) continue
    try {
      blocks.push(JSON.parse(raw))
    } catch {
      // Some sites emit trailing commas or multiple root objects — skip.
    }
  }
  return blocks
}

function flattenNodes(value: unknown): Record<string, unknown>[] {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap(flattenNodes)
  if (typeof value !== 'object') return []
  const obj = value as Record<string, unknown>
  const nodes = [obj]
  if (obj['@graph']) nodes.push(...flattenNodes(obj['@graph']))
  return nodes
}

function typeList(node: Record<string, unknown>): string[] {
  const t = node['@type']
  if (typeof t === 'string') return [t]
  if (Array.isArray(t)) return t.filter((item): item is string => typeof item === 'string')
  return []
}

function firstString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item)
      if (found) return found
    }
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return firstString(obj.url ?? obj.contentUrl ?? obj['@id'] ?? obj.name)
  }
  return null
}

function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i)
  if (!match) return null
  const days = Number(match[1] ?? 0)
  const hours = Number(match[2] ?? 0)
  const minutes = Number(match[3] ?? 0)
  const seconds = Number(match[4] ?? 0)
  const total = days * 24 * 60 + hours * 60 + minutes + Math.round(seconds / 60)
  return total > 0 ? total : null
}

function parseIngredientLine(line: string): ScrapedIngredient {
  const cleaned = line.replace(/\s+/g, ' ').trim()
  const match = cleaned.match(/^([\d./]+)\s*([a-zA-Z]+)?\s+(.+)$/)
  if (!match) return { name: cleaned, quantity: null, unit: null }
  const quantityRaw = match[1]
  const quantity = quantityRaw.includes('/')
    ? quantityRaw.split('/').map(Number).reduce((a, b) => (b ? a / b : a))
    : Number(quantityRaw)
  return {
    name: match[3].trim(),
    quantity: Number.isFinite(quantity) ? quantity : null,
    unit: match[2]?.trim() || null,
  }
}

function parseInstructions(value: unknown): string[] {
  if (!value) return []
  if (typeof value === 'string') {
    return value
      .split(/\r?\n+/)
      .map((line) => line.replace(/^\d+[.)]\s*/, '').trim())
      .filter(Boolean)
  }
  if (Array.isArray(value)) {
    const steps: string[] = []
    for (const item of value) {
      if (typeof item === 'string') {
        const text = item.trim()
        if (text) steps.push(text)
        continue
      }
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const types = typeList(obj)
      if (types.includes('HowToSection') && obj.itemListElement) {
        steps.push(...parseInstructions(obj.itemListElement))
        continue
      }
      const text = firstString(obj.text ?? obj.name)
      if (text) steps.push(text)
    }
    return steps
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return parseInstructions(obj.itemListElement ?? obj.text ?? obj.name)
  }
  return []
}

function recipeFromJsonLd(
  node: Record<string, unknown>,
  sourceUrl: string,
  sourceName: string,
): ScrapedRecipe | null {
  const name = firstString(node.name)
  if (!name) return null
  const ingredientLines = Array.isArray(node.recipeIngredient)
    ? node.recipeIngredient.filter((line): line is string => typeof line === 'string')
    : []
  const ingredients = ingredientLines.map(parseIngredientLine)
  const instructions = parseInstructions(node.recipeInstructions)
  if (!ingredients.length && !instructions.length) return null

  const prep = parseIsoDuration(node.prepTime)
  const cook = parseIsoDuration(node.cookTime)
  const total = parseIsoDuration(node.totalTime)
  const cookMinutes = cook ?? (prep == null ? total : null)
  const imageUrl = firstString(node.image)

  return {
    providerId: hashId(sourceUrl),
    name,
    ingredients,
    instructions,
    prepMinutes: prep,
    cookMinutes,
    timeIsEstimated: prep == null && cook == null && total == null,
    imageUrl,
    sourceName,
    sourceUrl,
    sourcePageFetched: true,
    cuisineHint: firstString(node.recipeCuisine),
  }
}

export function parseRecipeHtml(
  html: string,
  sourceUrl: string,
  sourceName: string,
): ScrapedRecipe | null {
  const nodes = extractJsonLdBlocks(html).flatMap(flattenNodes)
  for (const node of nodes) {
    if (!typeList(node).some((t) => t.toLowerCase() === 'recipe')) continue
    const recipe = recipeFromJsonLd(node, sourceUrl, sourceName)
    if (recipe) return recipe
  }
  return null
}

function hostAllowed(hostname: string, domains: string[]): boolean {
  const host = hostname.replace(/^www\./, '').toLowerCase()
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
}

export function extractCandidateLinks(html: string, baseUrl: string, domains: string[]): string[] {
  const hrefs = [...html.matchAll(/\bhref=["']([^"'#]+)["']/gi)].map((match) => match[1])
  const out: string[] = []
  for (const href of hrefs) {
    try {
      const url = new URL(href, baseUrl)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
      if (!hostAllowed(url.hostname, domains)) continue
      if (url.pathname.length < 2) continue
      if (SKIP_EXT.test(url.pathname)) continue
      if (SKIP_PATH.test(url.pathname)) continue
      if (/[?&]s=/.test(url.search)) continue
      // Prefer article-like slugs (exclude bare section roots).
      const slug = url.pathname.replace(/\/$/, '').split('/').filter(Boolean)
      if (slug.length === 0) continue
      if (slug.length === 1 && slug[0].length < 8) continue
      const clean = `${url.origin}${url.pathname}`.replace(/\/$/, '')
      if (!out.includes(clean)) out.push(clean)
    } catch {
      // ignore bad URLs
    }
  }
  return out
}

function originFromTemplate(template: string): string | null {
  try {
    return new URL(template.replace('{q}', 'x')).origin
  } catch {
    return null
  }
}

async function wordpressPostLinks(origin: string, query: string, limit: number): Promise<string[]> {
  const url = new URL('/wp-json/wp/v2/posts', origin)
  url.searchParams.set('search', query)
  url.searchParams.set('per_page', String(limit))
  url.searchParams.set('_fields', 'link')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
      },
    })
    if (!response.ok) return []
    const payload = (await response.json()) as { link?: string }[]
    if (!Array.isArray(payload)) return []
    return payload
      .map((item) => item.link?.trim())
      .filter((link): link is string => Boolean(link))
      .map((link) => link.replace(/\/$/, ''))
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

export async function scrapeRecipePage(
  pageUrl: string,
  sourceName: string,
): Promise<ScrapedRecipe | null> {
  const html = await fetchHtml(pageUrl)
  if (!html) return null
  return parseRecipeHtml(html, pageUrl, sourceName)
}

export async function searchPublisherRecipes(
  publisher: PublisherScrapeTarget,
  query: string,
  limit = 3,
): Promise<ScrapedRecipe[]> {
  if (!publisher.searchUrlTemplate) return []
  const origin = originFromTemplate(publisher.searchUrlTemplate)
  let candidates: string[] = []
  if (origin) {
    candidates = await wordpressPostLinks(origin, query, limit + 1)
  }
  if (!candidates.length) {
    const searchUrl = buildSearchUrl(publisher.searchUrlTemplate, query)
    const html = await fetchHtml(searchUrl)
    if (html) {
      candidates = extractCandidateLinks(html, searchUrl, publisher.domains).slice(0, limit + 2)
    }
  }

  const recipes: ScrapedRecipe[] = []
  for (const pageUrl of candidates) {
    if (recipes.length >= limit) break
    const recipe = await scrapeRecipePage(pageUrl, publisher.name)
    if (recipe) recipes.push(recipe)
  }
  return recipes
}

export async function searchPreferredPublishers(
  publishers: PublisherScrapeTarget[],
  query: string,
  options?: { perPublisher?: number; maxPublishers?: number },
): Promise<ScrapedRecipe[]> {
  const perPublisher = options?.perPublisher ?? 3
  const maxPublishers = options?.maxPublishers ?? 3
  const targets = publishers.filter((item) => item.searchUrlTemplate).slice(0, maxPublishers)
  const batches = await Promise.all(
    targets.map((publisher) => searchPublisherRecipes(publisher, query, perPublisher)),
  )
  const unique = new Map<string, ScrapedRecipe>()
  for (const recipe of batches.flat()) {
    unique.set(recipe.sourceUrl, recipe)
  }
  return [...unique.values()]
}
