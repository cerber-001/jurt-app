import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      // 1.1: prompt — новая версия скачивается в фоне и ждёт, пока паломник нажмёт «Обновить» на плашке.
      // autoUpdate перезагружал бы страницу сам, в том числе посреди тавафа.
      registerType: 'prompt',
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
        // первая установка: офлайн-копия берёт страницу под контроль сразу, без второго открытия.
        // Обновления этим не ускоряются — новая версия всё равно ждёт нажатия «Обновить».
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,json}'],
        // этап 1а: модель Харама (≈2,4 МБ) не качается каждому при установке гида — только при первом открытии окна 3D
        // (кэш haram3d-model ниже). Файлы JS самого окна (three.js) остаются в precache — их отдаёт **/*.js
        globIgnores: ['**/node_modules/**/*', 'haram3d/**'],
        runtimeCaching: [
          {
            // наша модель Харама (public/haram3d/v1/): открыли один раз дома — дальше работает без сети.
            // CacheFirst без срока держит файлы навсегда, поэтому версия — в пути и в имени кэша:
            // при новой модели — каталог v2 (MODEL_BASE в src/lib/haram3d.ts) и новое имя кэша haram3d-model-v2
            urlPattern: /\/haram3d\/v1\/.+\.(glb|json|wasm|js)$/i,
            handler: 'CacheFirst',
            options: { cacheName: 'haram3d-model-v1', expiration: { maxEntries: 20 }, cacheableResponse: { statuses: [200] } },
          },
          // Фото-3D Google (tile.googleapis.com) здесь намеренно НЕ кэшируется: правила Google запрещают хранить тайлы.
          // Правил для tile.googleapis.com не добавлять; тайлы не пишутся и в IndexedDB/localStorage (components/haram3d/google.ts)
          {
            // API (Apps Script или Edge Function Supabase): сеть в приоритете, при офлайне — последний ответ
            urlPattern: /^https:\/\/(script\.google(usercontent)?\.com|[a-z0-9]+\.supabase\.co\/functions)\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 8, expiration: { maxEntries: 20, maxAgeSeconds: 7 * 24 * 3600 } },
          },
          // программа тура (umra.jurt.kz/program/) здесь намеренно не кэшируется: иначе на зависшей сети старый ответ
          // выдавался бы за свежий. Офлайн-копия с датой — в localStorage, таймаут — в src/lib/program.ts.
        ],
      },
    }),
  ],
  build: { target: 'es2020' },
})
