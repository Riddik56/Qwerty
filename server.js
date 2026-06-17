import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { existsSync, readFileSync, statSync } from 'fs'
import { extname, join } from 'path'
// With `cloudflare: false`, TanStack outputs `server.js`, not `index.js`.
import workerEntry from './dist/server/server.js'

const app = new Hono()
const executionContext = {
  waitUntil: () => {},
  passThroughOnException: () => {},
}

const MATERIALS_ROOT = join(process.cwd(), 'docs', 'materials')

function getContentTypeByExt(ext) {
  const normalized = ext.toLowerCase()
  if (normalized === '.pdf') return 'application/pdf'
  if (normalized === '.doc') return 'application/msword'
  if (normalized === '.docx')
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (normalized === '.rtf') return 'application/rtf'
  return 'application/octet-stream'
}

// Serve training documents directly from docs/materials on Render.
app.get('/materials/*', async (c) => {
  const wildcard = c.req.path.replace(/^\/materials\//, '')
  const segments = wildcard
    .split('/')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part)
      } catch {
        return part
      }
    })

  // Guard against path traversal and malformed paths.
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment === '.' || segment === '..' || segment.includes('\\') || segment.includes('\0'),
    )
  ) {
    return c.text('File not found', 404)
  }

  const absolutePath = join(MATERIALS_ROOT, ...segments)
  if (!existsSync(absolutePath)) return c.text('File not found', 404)
  if (!statSync(absolutePath).isFile()) return c.text('File not found', 404)

  const fileName = segments[segments.length - 1] || 'file'
  const encodedName = encodeURIComponent(fileName)
  const contentType = getContentTypeByExt(extname(fileName))
  const content = readFileSync(absolutePath)

  return new Response(content, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

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
