import { handleGrid } from '../../server/smsHandler'

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      return await handleGrid(request)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not draw the week.'
      return new Response(message, { status: 500 })
    }
  },
}
