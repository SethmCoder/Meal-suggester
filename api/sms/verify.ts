import { handleVerify } from '../../server/smsHandler'

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      return await handleVerify(request)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not verify that phone.'
      return Response.json({ error: message }, { status: 500 })
    }
  },
}
