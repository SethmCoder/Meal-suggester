export interface RecipePublisher {
  id: string
  name: string
  domains: string[]
  searchHint: string
  /**
   * Site search URL used by the local Vite scrape API.
   * `{q}` is replaced with encodeURIComponent(query).
   * null = skip direct scrape (paywall / no usable search).
   */
  searchUrlTemplate: string | null
}

/** Publishers we can prefer via local scrape and/or aggregator source URLs. */
export const RECIPE_PUBLISHERS: RecipePublisher[] = [
  {
    id: 'recipetineats',
    name: 'RecipeTin Eats',
    domains: ['recipetineats.com'],
    searchHint: 'recipetineats',
    searchUrlTemplate: 'https://www.recipetineats.com/?s={q}',
  },
  {
    id: 'justonecookbook',
    name: 'Just One Cookbook',
    domains: ['justonecookbook.com'],
    searchHint: 'just one cookbook',
    searchUrlTemplate: 'https://www.justonecookbook.com/?s={q}',
  },
  {
    id: 'seriouseats',
    name: 'Serious Eats',
    domains: ['seriouseats.com'],
    searchHint: 'serious eats',
    searchUrlTemplate: 'https://www.seriouseats.com/search?q={q}',
  },
  {
    id: 'budgetbytes',
    name: 'Budget Bytes',
    domains: ['budgetbytes.com'],
    searchHint: 'budget bytes',
    searchUrlTemplate: 'https://www.budgetbytes.com/?s={q}',
  },
  {
    id: 'minimalistbaker',
    name: 'Minimalist Baker',
    domains: ['minimalistbaker.com'],
    searchHint: 'minimalist baker',
    searchUrlTemplate: 'https://minimalistbaker.com/?s={q}',
  },
  {
    id: 'smittenkitchen',
    name: 'Smitten Kitchen',
    domains: ['smittenkitchen.com'],
    searchHint: 'smitten kitchen',
    searchUrlTemplate: 'https://smittenkitchen.com/?s={q}',
  },
  {
    id: 'bonappetit',
    name: 'Bon Appétit',
    domains: ['bonappetit.com'],
    searchHint: 'bon appetit',
    searchUrlTemplate: 'https://www.bonappetit.com/search?q={q}',
  },
  {
    id: 'nytcooking',
    name: 'NYT Cooking',
    domains: ['cooking.nytimes.com', 'nytimes.com'],
    searchHint: 'nyt cooking',
    searchUrlTemplate: null,
  },
  {
    id: 'bbcgoodfood',
    name: 'BBC Good Food',
    domains: ['bbcgoodfood.com'],
    searchHint: 'bbc good food',
    searchUrlTemplate: 'https://www.bbcgoodfood.com/search?q={q}',
  },
  {
    id: 'allrecipes',
    name: 'Allrecipes',
    domains: ['allrecipes.com'],
    searchHint: 'allrecipes',
    searchUrlTemplate: 'https://www.allrecipes.com/search?q={q}',
  },
]

export function publisherById(id: string): RecipePublisher | undefined {
  return RECIPE_PUBLISHERS.find((item) => item.id === id)
}

export function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

export function matchPublisher(url: string | null | undefined): RecipePublisher | null {
  const host = hostnameOf(url)
  if (!host) return null
  return (
    RECIPE_PUBLISHERS.find((publisher) =>
      publisher.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)),
    ) ?? null
  )
}

export function displaySourceName(sourceName: string, sourceUrl: string | null | undefined): string {
  const matched = matchPublisher(sourceUrl)
  if (matched) return matched.name
  if (sourceName && sourceName !== 'Spoonacular') return sourceName
  const host = hostnameOf(sourceUrl)
  return host ?? sourceName
}

export function preferredPublishers(ids: string[]): RecipePublisher[] {
  const selected = new Set(ids)
  return RECIPE_PUBLISHERS.filter((publisher) => selected.has(publisher.id))
}
