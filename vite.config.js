import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'serverless-proxy-dev',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/api/proxy')) {
            try {
              const { default: handler } = await import('./api/proxy.js')
              const url = new URL(req.url, 'http://localhost')
              req.query = Object.fromEntries(url.searchParams.entries())
              let body = ''
              req.on('data', (chunk) => { body += chunk })
              req.on('end', async () => {
                req.body = body
                const resWrapper = {
                  setHeader: (k, v) => res.setHeader(k, v),
                  status: (code) => {
                    res.statusCode = code
                    return {
                      json: (data) => {
                        res.setHeader('Content-Type', 'application/json')
                        res.end(JSON.stringify(data))
                      },
                      end: () => res.end(),
                    }
                  },
                }
                try {
                  await handler(req, resWrapper)
                } catch (err) {
                  res.statusCode = 500
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ error: err.message }))
                }
              })
              return
            } catch {
              next()
            }
          } else {
            next()
          }
        })
      },
    },
  ],
})
