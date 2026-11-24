/* Фото-3D: настоящие классы 3d-tiles-renderer (без сети и без WebGL) — то, на что опирается google.ts.
   Сломается при обновлении библиотеки — значит, лимит памяти или распознавание квоты надо перепроверить */
import { describe, expect, test } from 'vitest'
import { TilesRenderer } from '3d-tiles-renderer/three'
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins'
import { tuneForDevice } from './google'

const MB = 1024 * 1024

describe('библиотека тайлов', () => {
  test('у плагина Google есть auth.fetch — через него ловим 429/403 «квота»', () => {
    const p = new GoogleCloudAuthPlugin({ apiToken: 'x' }) as unknown as { auth?: { fetch?: unknown } }
    expect(typeof p.auth?.fetch).toBe('function')
  })

  test('телефон: память под тайлы 80–150 МБ и errorTarget выше рекомендованного Google (поверх его настроек)', () => {
    const tiles = new TilesRenderer()
    tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: 'x', useRecommendedSettings: true }))
    tuneForDevice(tiles, true)
    expect(tiles.lruCache.minBytesSize).toBe(80 * MB)
    expect(tiles.lruCache.maxBytesSize).toBe(150 * MB)
    expect(tiles.errorTarget).toBeGreaterThan(20)
    tiles.dispose()
  })

  test('компьютер: памяти больше, но меньше 400 МБ библиотеки по умолчанию; errorTarget не трогаем', () => {
    const tiles = new TilesRenderer()
    const before = tiles.errorTarget
    tuneForDevice(tiles, false)
    expect(tiles.lruCache.maxBytesSize).toBeGreaterThan(150 * MB)
    expect(tiles.lruCache.maxBytesSize).toBeLessThan(400 * MB)
    expect(tiles.lruCache.minBytesSize).toBeLessThan(tiles.lruCache.maxBytesSize)
    expect(tiles.errorTarget).toBe(before)
    tiles.dispose()
  })
})
