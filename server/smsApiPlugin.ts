import type { Connect, Plugin } from 'vite'
import { handleGrid, handleInbound, handleVerify } from './smsHandler'

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function toRequest(req: Connect.IncomingMessage): Promise<Request> {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value)
  }
  const method = req.method ?? 'GET'
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req)
  return new Request(`http://localhost${req.url ?? '/'}`, { method, headers, body })
}

function attach(middlewares: Connect.Server) {
  middlewares.use(async (req, res, next) => {
    const path = req.url?.split('?')[0]
    const handler =
      path === '/api/sms/verify' ? handleVerify : path === '/api/sms/inbound' ? handleInbound : path === '/api/sms/grid' ? handleGrid : null
    if (!handler) {
      next()
      return
    }
    try {
      const response = await handler(await toRequest(req))
      res.statusCode = response.status
      response.headers.forEach((value, key) => res.setHeader(key, value))
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      res.statusCode = 500
      res.end(error instanceof Error ? error.message : 'SMS request failed')
    }
  })
}

export function smsApiPlugin(): Plugin {
  return {
    name: 'planora-sms-api',
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}
