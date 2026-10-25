import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['fonts/*.woff2', '*.png', 'logo-white.svg'],
      manifest: {
        name: 'JURT · Платформа паломника',
        short_name: 'JURT',
        description: 'Гид паломника, программа тура и штаб группы. Демо-версия v3.',
        lang: 'ru',
        id: '/',
        scope: '/',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#005A5C',
        theme_color: '#005A5C',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,json}'],
        runtimeCaching: [
          {
            // API (Apps Script или Edge Function Supabase): сеть в приоритете, при офлайне — последний ответ
            urlPattern: /^https:\/\/(script\.google(usercontent)?\.com|[a-z0-9]+\.supabase\.co\/functions)\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 8, expiration: { maxEntries: 20, maxAgeSeconds: 7 * 24 * 3600 } },
          },
          {
            urlPattern: /^https:\/\/umra\.jurt\.kz\/program\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'program', expiration: { maxEntries: 10, maxAgeSeconds: 30 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2020' },
})
