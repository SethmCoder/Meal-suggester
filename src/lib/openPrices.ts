/** Community prices from https://prices.openfoodfacts.org (Open Prices, ODbL). */

const API = 'https://prices.openfoodfacts.org/api/v1'
const GROCERY_TAGS = new Set([
  'supermarket',
  'convenience',
  'grocery',
  'wholesale',
  'marketplace',
  'greengrocer',
  'general',
])

const JUNK_WORDS = ['chocolate', 'candy', 'biscuit', 'cookie', 'cake', 'nugget', 'gummy', 'ice cream']

export interface NearbyStore {
  id: number
  name: string
  city: string | null
  distanceKm: number
  priceCount: number
}

export interface IngredientPrice {
  averageUsd: number | null
  sampleCount: number
  exampleProduct: string | null
  scope: 'nearby' | 'us' | 'none'
}

export interface PriceQuote {
  lat: number
  lon: number
  radiusKm: number
  stores: NearbyStore[]
  byKey: Record<string, IngredientPrice>
}

interface LocationRow {
  id?: number
  osm_name?: string | null
  osm_address_city?: string | null
  osm_tag_value?: string | null
  distance_km?: number
  price_count?: number
}

interface ProductRow {
  code?: string
  product_name?: string | null
  price_count?: number
}

interface PriceRow {
  price?: number
  currency?: string
  product?: { product_name?: string | null } | null
}

export function scoreProductName(query: string, productName: string | null | undefined): number {
  const name = (productName ?? '').toLowerCase()
  const q = query.toLowerCase().trim()
  if (!name || !q) return 0
  const words = q.split(/[^a-z0-9]+/).filter((word) => word.length > 2)
  if (!words.length) return 0
  const hits = words.filter((word) => name.includes(word))
  if (!hits.length) return 0
  let score = (hits.length / words.length) * 50
  if (name.includes(q)) score += 30
  if (JUNK_WORDS.some((word) => name.includes(word) && !q.includes(word))) score -= 40
  return score
}

export function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return Math.round(value * 100) / 100
}

export function requestDeviceLocation(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser cannot share your location.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      () => reject(new Error('Location permission is needed to find nearby grocery stores.')),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 },
    )
  })
}

async function getJson<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(API + path)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Open Prices request failed (${response.status}).`)
  return (await response.json()) as T
}

export async function findNearbyStores(lat: number, lon: number): Promise<{ stores: NearbyStore[]; radiusKm: number }> {
  const radii = [8, 25, 60]
  let chosen: NearbyStore[] = []
  let radiusKm = radii[0]
  for (const radius of radii) {
    radiusKm = radius
    const data = await getJson<{ items?: LocationRow[] }>('/locations/nearby', {
      lat,
      lon,
      radius_km: radius,
      size: 40,
    })
    chosen = (data.items ?? [])
      .filter((item) => GROCERY_TAGS.has(String(item.osm_tag_value ?? '')) && (item.price_count ?? 0) > 0 && item.id)
      .map((item) => ({
        id: Number(item.id),
        name: item.osm_name?.trim() || 'Grocery store',
        city: item.osm_address_city ?? null,
        distanceKm: Math.round((item.distance_km ?? 0) * 10) / 10,
        priceCount: item.price_count ?? 0,
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 6)
    if (chosen.length >= 2) break
  }
  return { stores: chosen, radiusKm }
}

async function pricesForCodes(
  codes: string[],
  extra: Record<string, string | number>,
): Promise<PriceRow[]> {
  if (!codes.length) return []
  const data = await getJson<{ items?: PriceRow[] }>('/prices', {
    product_code__in: codes.join(','),
    currency: 'USD',
    size: 20,
    order_by: '-date',
    ...extra,
  })
  return data.items ?? []
}

async function estimateOne(
  name: string,
  storeIds: number[],
): Promise<IngredientPrice> {
  const data = await getJson<{ items?: ProductRow[] }>('/products', {
    product_name__like: name,
    price_count__gte: 1,
    size: 8,
    order_by: '-price_count',
  })
  const ranked = (data.items ?? [])
    .map((item) => ({ item, score: scoreProductName(name, item.product_name) }))
    .filter((row) => row.item.code && row.score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
  const codes = ranked.map((row) => String(row.item.code))
  const example = ranked[0]?.item.product_name ?? null
  if (!codes.length) {
    return { averageUsd: null, sampleCount: 0, exampleProduct: null, scope: 'none' }
  }

  let rows: PriceRow[] = []
  let scope: IngredientPrice['scope'] = 'none'
  if (storeIds.length) {
    rows = await pricesForCodes(codes, { location_id__in: storeIds.join(',') })
    if (rows.length) scope = 'nearby'
  }
  if (!rows.length) {
    rows = await pricesForCodes(codes, {})
    if (rows.length) scope = 'us'
  }
  const averageUsd = median(rows.map((row) => Number(row.price)).filter((price) => price > 0 && price < 80))
  return {
    averageUsd,
    sampleCount: rows.length,
    exampleProduct: example,
    scope: averageUsd == null ? 'none' : scope,
  }
}

export async function estimateIngredientPrices(
  items: { key: string; name: string }[],
  lat: number,
  lon: number,
): Promise<PriceQuote> {
  const { stores, radiusKm } = await findNearbyStores(lat, lon)
  const storeIds = stores.map((store) => store.id)
  const byKey: Record<string, IngredientPrice> = {}
  const queue = [...items]
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift()
      if (!next) return
      try {
        byKey[next.key] = await estimateOne(next.name, storeIds)
      } catch {
        byKey[next.key] = { averageUsd: null, sampleCount: 0, exampleProduct: null, scope: 'none' }
      }
    }
  })
  await Promise.all(workers)
  return { lat, lon, radiusKm, stores, byKey }
}
