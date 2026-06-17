import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
// With `cloudflare: false`, TanStack outputs `server.js`, not `index.js`.
import workerEntry from './dist/server/server.js'

const app = new Hono()
const executionContext = {
  waitUntil: () => {},
  passThroughOnException: () => {},
}

// TanStack SSR + server functions must run before static fallback.
app.all('*', async (c) => {
  try {
    const response = await workerEntry.fetch(c.req.raw, process.env, executionContext)
    if (response.status !== 404) return response
  } catch (error) {
    console.error('Render request failed', error)
    return c.text('Internal Server Error', 500)
  }

  if (c.req.method === 'GET' || c.req.method === 'HEAD') {
    return serveStatic({ root: './dist/client' })(c, () => c.notFound())
  }

  return c.notFound()
})

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000

console.log(`Starting Node.js server on port ${port}...`)
serve({
  fetch: app.fetch,
  port,
  hostname: '0.0.0.0',
})
