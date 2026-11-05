import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev only: runs /api/demo-report (the Vercel function) inside the Vite server
const localApi = (env) => ({
  name: 'local-api',
  configureServer(server) {
    Object.assign(process.env, env)
    server.middlewares.use('/api/demo-report', async (req, res) => {
      let raw = ''
      for await (const chunk of req) raw += chunk
      req.body = raw ? JSON.parse(raw) : {}
      res.status = (code) => ((res.statusCode = code), res)
      res.json = (obj) => (res.setHeader('Content-Type', 'application/json'), res.end(JSON.stringify(obj)))
      res.send = (data) => res.end(data)
      const { default: handler } = await server.ssrLoadModule('/api/demo-report.js')
      try {
        await handler(req, res)
      } catch (e) {
        res.status(500).json({ error: String(e.message || e) })
      }
    })
  },
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), localApi(loadEnv(mode, process.cwd(), ''))],
  server: { port: 5173, open: true },
  build: { chunkSizeWarningLimit: 1200 }, // exceljs loads only when downloading
}))
