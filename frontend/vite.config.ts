import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const TEMP_IMAGES_DIR = path.resolve(__dirname, 'public/temp-images')
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB decoded
const MAX_FILES = 50

function ensureTempDir() {
  if (!fs.existsSync(TEMP_IMAGES_DIR)) {
    fs.mkdirSync(TEMP_IMAGES_DIR, { recursive: true })
  }
}

function enforceFileLimit() {
  const files = fs.readdirSync(TEMP_IMAGES_DIR)
    .filter((f) => f.endsWith('.webp'))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(TEMP_IMAGES_DIR, f)).mtimeMs
    }))
    .sort((a, b) => a.mtime - b.mtime)

  while (files.length >= MAX_FILES) {
    const oldest = files.shift()
    if (oldest) {
      fs.unlinkSync(path.join(TEMP_IMAGES_DIR, oldest.name))
    }
  }
}

function imageSaverPlugin(): Plugin {
  return {
    name: 'image-saver',
    configureServer(server) {
      server.middlewares.use('/api/save-image', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        const MAX_BODY_SIZE = 10 * 1024 * 1024 // ~10MB covers base64 overhead for 5MB file
        let body = ''
        let bodySize = 0
        let aborted = false
        req.on('data', (chunk: Buffer) => {
          bodySize += chunk.length
          if (bodySize > MAX_BODY_SIZE) {
            aborted = true
            res.statusCode = 413
            res.end(JSON.stringify({ error: 'Request body too large' }))
            req.destroy()
            return
          }
          body += chunk.toString()
        })
        req.on('end', () => {
          if (aborted) return
          try {
            const { dataUrl, source } = JSON.parse(body)

            if (typeof dataUrl !== 'string' || typeof source !== 'string') {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Missing dataUrl or source' }))
              return
            }

            // Validate source to prevent path traversal
            const sanitizedSource = source.replace(/[^a-zA-Z0-9-]/g, '')
            if (!sanitizedSource) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid source' }))
              return
            }

            const match = dataUrl.match(/^data:image\/[\w+.-]+;base64,(.+)$/)
            if (!match) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid data URL format' }))
              return
            }

            const buffer = Buffer.from(match[1], 'base64')
            if (buffer.length > MAX_FILE_SIZE) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'File too large (max 5MB)' }))
              return
            }

            ensureTempDir()
            enforceFileLimit()

            const timestamp = Date.now()
            const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 4)
            const filename = `${sanitizedSource}-${timestamp}-${hash}.webp`
            const fullPath = path.join(TEMP_IMAGES_DIR, filename)

            // Final path traversal check
            if (!fullPath.startsWith(TEMP_IMAGES_DIR)) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid file path' }))
              return
            }

            fs.writeFileSync(fullPath, buffer)

            const filePath = `frontend/public/temp-images/${filename}`
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ filePath, filename }))
          } catch {
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Failed to save image' }))
          }
        })
      })

      server.middlewares.use('/api/delete-image', (req, res) => {
        if (req.method !== 'DELETE') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        try {
          const url = new URL(req.url ?? '', 'http://localhost')
          const filename = url.searchParams.get('filename')

          if (!filename || !/^[\w-]+\.webp$/.test(filename)) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Invalid filename' }))
            return
          }

          const fullPath = path.join(TEMP_IMAGES_DIR, filename)
          if (!fullPath.startsWith(TEMP_IMAGES_DIR)) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Invalid file path' }))
            return
          }

          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath)
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ deleted: true }))
        } catch {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Failed to delete image' }))
        }
      })

      server.middlewares.use('/api/clear-images', (req, res) => {
        if (req.method !== 'DELETE') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        try {
          if (fs.existsSync(TEMP_IMAGES_DIR)) {
            const files = fs.readdirSync(TEMP_IMAGES_DIR)
              .filter((f) => f.endsWith('.webp'))
            for (const file of files) {
              fs.unlinkSync(path.join(TEMP_IMAGES_DIR, file))
            }
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ cleared: true }))
        } catch {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Failed to clear images' }))
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), imageSaverPlugin()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/proxy': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/inspector': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
})
