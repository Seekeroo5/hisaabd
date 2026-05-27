import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

function collectFiles(directory: string, root = directory): string[] {
  return readdirSync(directory).flatMap((name) => {
    const filePath = resolve(directory, name)
    const stat = statSync(filePath)

    if (stat.isDirectory()) {
      return collectFiles(filePath, root)
    }

    return `/${relative(root, filePath).split(sep).join('/')}`
  })
}

function dailyTallyServiceWorker(): Plugin {
  let config: ResolvedConfig

  return {
    name: 'dailytally-service-worker',
    apply: 'build',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir)
      const assets = ['/', ...collectFiles(outDir).filter((asset) => asset !== '/sw.js')]
      const sw = `const CACHE_NAME = 'dailytally-${Date.now()}'
const CORE_ASSETS = ${JSON.stringify(assets, null, 2)}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        }

        return response
      })
    }),
  )
})
`

      writeFileSync(resolve(outDir, 'sw.js'), sw)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dailyTallyServiceWorker()],
})
