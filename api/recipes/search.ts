import { runRecipeSearch } from '../../server/recipeSearch'

/**
 * Vercel serverless: GET /api/recipes/search?q=chicken&sites=recipetineats,budgetbytes
 * Same contract as the local Vite middleware used in `npm run dev`.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return Response.json({ error: 'Method not allowed', recipes: [] }, { status: 405 })
    }

    const url = new URL(request.url)
    const result = await runRecipeSearch(url.searchParams.get('q') ?? '', url.searchParams.get('sites') ?? '')

    return Response.json(result.body, {
      status: result.status,
      headers: { 'Cache-Control': 'no-store' },
    })
  },
}
