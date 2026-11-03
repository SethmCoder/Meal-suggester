export interface RecipePublisher {
  id: string
  name: string
  domains: string[]
  searchHint: string
}

/** Publishers we can prefer when aggregators return a real source URL. */
export const RECIPE_PUBLISHERS: RecipePublisher[] = [
  {
    id: 'recipetineats',
    name: 'RecipeTin Eats',
    domains: ['recipetineats.com'],
    searchHint: 'recipetineats',
  },
  {
    id: 'justonecookbook',
    name: 'Just One Cookbook',
    domains: ['justonecookbook.com'],
    searchHint: 'just one cookbook',
  },
  {
    id: 'seriouseats',
    name: 'Serious Eats',
    domains: ['seriouseats.com'],
    searchHint: 'serious eats',
  },
  {
    id: 'budgetbytes',
    name: 'Budget Bytes',
    domains: ['budgetbytes.com'],
    searchHint: 'budget bytes',
  },
  {
    id: 'minimalistbaker',
    name: 'Minimalist Baker',
    domains: ['minimalistbaker.com'],
    searchHint: 'minimalist baker',
  },
  {
    id: 'smittenkitchen',
    name: 'Smitten Kitchen',
    domains: ['smittenkitchen.com'],
    searchHint: 'smitten kitchen',
  },
  {
    id: 'bonappetit',
    name: 'Bon Appétit',
    domains: ['bonappetit.com'],
    searchHint: 'bon appetit',
  },
  {
    id: 'nytcooking',
    name: 'NYT Cooking',
    domains: ['cooking.nytimes.com', 'nytimes.com'],
    searchHint: 'nyt cooking',
  },
  {
    id: 'bbcgoodfood',
    name: 'BBC Good Food',
    domains: ['bbcgoodfood.com'],
    searchHint: 'bbc good food',
  },
  {
    id: 'allrecipes',
    name: 'Allrecipes',
    domains: ['allrecipes.com'],
    searchHint: 'allrecipes',
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
