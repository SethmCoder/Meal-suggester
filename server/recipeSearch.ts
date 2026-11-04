import { RECIPE_PUBLISHERS } from '../src/lib/recipeSources'
import { searchPreferredPublishers, type PublisherScrapeTarget, type ScrapedRecipe } from './recipeScrape'

export interface RecipeSearchResult {
  status: number
  body: { recipes: ScrapedRecipe[]; error?: string }
}

function scrapeTargets(ids: string[]): PublisherScrapeTarget[] {
  const selected = new Set(ids)
  return RECIPE_PUBLISHERS.filter((publisher) => selected.has(publisher.id)).map((publisher) => ({
    id: publisher.id,
    name: publisher.name,
    domains: publisher.domains,
    searchUrlTemplate: publisher.searchUrlTemplate,
  }))
}

/** Shared by Vite middleware (local) and Vercel `/api/recipes/search`. */
export async function runRecipeSearch(queryRaw: string, sitesRaw: string): Promise<RecipeSearchResult> {
  const query = queryRaw.trim()
  const sites = sitesRaw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (!query) return { status: 400, body: { error: 'Missing q', recipes: [] } }
  if (!sites.length) return { status: 200, body: { recipes: [] } }

  try {
    const recipes = await searchPreferredPublishers(scrapeTargets(sites), query, {
      perPublisher: 3,
      maxPublishers: 3,
    })
    return { status: 200, body: { recipes } }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scrape failed'
    return { status: 500, body: { error: message, recipes: [] } }
  }
}
