import { handleInbound } from '../../server/smsHandler'

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      return await handleInbound(request)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read that text.'
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>${message}</Body></Message></Response>`,
        { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
      )
    }
  },
}
