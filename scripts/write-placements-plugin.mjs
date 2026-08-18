/**
 * Dev-only Vite plugin: a write endpoint for the world placement editor
 * (`?editor`). `apply: 'serve'` keeps it out of `vite build` entirely —
 * there is no production code path that can reach this file's logic.
 *
 * POST /__write-placements
 *   body: { "placements": [{ id, type, lat, long, yawDeg, scale, ... }] }
 *   200 -> { ok: true, count: N, path: "src/content/placements.json" }
 *   400 -> { error: "..." }   (bad JSON / shape / sanity-gate failure)
 *   413 -> { error: "..." }   (body over 2 MB)
 *   500 -> { error: "..." }   (write failed)
 *
 * The sanity gate is the only thing standing between an editor UI bug
 * and a corrupted world file, so it rejects before anything touches disk.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MAX_BODY_BYTES = 2 * 1024 * 1024

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(payload)
}

/** First reason `placements` isn't safe to write, or null if it's fine. */
function firstProblem(placements) {
  if (!Array.isArray(placements)) return 'body must have a "placements" array'
  const seenIds = new Set()
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]
    if (typeof p !== 'object' || p === null) return `placements[${i}] is not an object`
    if (typeof p.id !== 'string') return `placements[${i}].id must be a string`
    if (typeof p.type !== 'string') return `placements[${i}].type must be a string`
    for (const key of ['lat', 'long', 'yawDeg', 'scale']) {
      if (typeof p[key] !== 'number' || !Number.isFinite(p[key])) {
        return `placements[${i}].${key} must be a finite number`
      }
    }
    if (seenIds.has(p.id)) return `duplicate id "${p.id}"`
    seenIds.add(p.id)
  }
  return null
}

export default function writePlacementsPlugin() {
  return {
    name: 'write-placements',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__write-placements', (req, res, next) => {
        if (req.method !== 'POST') return next()

        const chunks = []
        let bytes = 0
        let rejected = false

        req.on('data', (chunk) => {
          if (rejected) return
          bytes += chunk.length
          if (bytes > MAX_BODY_BYTES) {
            rejected = true
            sendJson(res, 413, { error: `body exceeds ${MAX_BODY_BYTES} bytes` })
            req.destroy()
            return
          }
          chunks.push(chunk)
        })

        req.on('end', () => {
          if (rejected) return

          let body
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          } catch (err) {
            sendJson(res, 400, { error: `invalid JSON: ${err.message}` })
            return
          }

          if (!body || !Array.isArray(body.placements)) {
            sendJson(res, 400, { error: 'body must have a "placements" array' })
            return
          }

          const problem = firstProblem(body.placements)
          if (problem) {
            sendJson(res, 400, { error: problem })
            return
          }

          try {
            const path = resolve(process.cwd(), 'src/content/placements.json')
            writeFileSync(path, JSON.stringify(body, null, 2) + '\n', 'utf8')
            console.log(`[placements] wrote ${body.placements.length} placements`)
            sendJson(res, 200, {
              ok: true,
              count: body.placements.length,
              path: 'src/content/placements.json',
            })
          } catch (err) {
            sendJson(res, 500, { error: err.message })
          }
        })
      })
    },
  }
}
