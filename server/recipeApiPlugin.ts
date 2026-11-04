import type { Connect, Plugin } from 'vite'
import { RECIPE_PUBLISHERS } from '../src/lib/recipeSources'
import { searchPreferredPublishers, type PublisherScrapeTarget } from './recipeScrape'

function scrapeTargets(ids: string[]): PublisherScrapeTarget[] {
  const selected = new Set(ids)
  return RECIPE_PUBLISHERS.filter((publisher) => selected.has(publisher.id)).map((publisher) => ({
    id: publisher.id,
    name: publisher.name,
    domains: publisher.domains,
    searchUrlTemplate: publisher.searchUrlTemplate,
  }))
}

function sendJson(res: Connect.ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readUrl(req: Connect.IncomingMessage): URL {
  return new URL(req.url ?? '/', 'http://localhost')
}

async function handleSearch(req: Connect.IncomingMessage, res: Connect.ServerResponse) {
  const url = readUrl(req)
  const query = (url.searchParams.get('q') ?? '').trim()
  const sites = (url.searchParams.get('sites') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (!query) {
    sendJson(res, 400, { error: 'Missing q', recipes: [] })
    return
  }
  if (!sites.length) {
    sendJson(res, 200, { recipes: [] })
    return
  }

  try {
    const recipes = await searchPreferredPublishers(scrapeTargets(sites), query, {
      perPublisher: 3,
      maxPublishers: 3,
    })
    sendJson(res, 200, { recipes })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scrape failed'
    sendJson(res, 500, { error: message, recipes: [] })
  }
}

function attach(middlewares: Connect.Server) {
  middlewares.use(async (req, res, next) => {
    const path = req.url?.split('?')[0]
    if (req.method === 'GET' && path === '/api/recipes/search') {
      await handleSearch(req, res)
      return
    }
    next()
  })
}

/** Local Vite middleware: GET /api/recipes/search?q=chicken&sites=recipetineats,budgetbytes */
export function recipeApiPlugin(): Plugin {
  return {
    name: 'planora-recipe-api',
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}
