import type { Connect, Plugin } from 'vite'
import { runRecipeSearch } from './recipeSearch'

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
  const result = await runRecipeSearch(url.searchParams.get('q') ?? '', url.searchParams.get('sites') ?? '')
  sendJson(res, result.status, result.body)
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

/** Local Vite middleware mirrors Vercel `/api/recipes/search`. */
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
