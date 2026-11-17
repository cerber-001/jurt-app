// @vitest-environment jsdom
/* Файл страницы (устаз, штаб, поездки) не загрузился — спокойный экран с кнопкой «Обновить», без перезагрузок сами */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'preact'
import { ErrorBoundary } from 'preact-iso'
import { memoryStorage } from '../tests/helpers/memoryStorage'

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()) })
afterEach(() => { vi.unstubAllGlobals() })

const tick = () => new Promise(r => setTimeout(r, 20))

describe('lazyRoute', () => {
  test('ошибка загрузки файла — экран «не загрузилась» с кнопкой «Обновить»', async () => {
    const { lazyRoute } = await import('./app')
    const load = vi.fn(() => Promise.reject(new Error('Failed to fetch dynamically imported module')))
    const Page = lazyRoute(load)
    const el = document.createElement('div')
    render(<ErrorBoundary><Page /></ErrorBoundary>, el)
    await tick()
    expect(el.textContent).toContain('не загрузилась')
    expect([...el.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Обновить'])
    expect(el.querySelector('[role=alert]')).not.toBeNull()
    expect(load).toHaveBeenCalledTimes(1)          // сама не перезагружается и не долбит сеть
    render(null, el)
  })

  test('файл загрузился — обычная страница', async () => {
    const { lazyRoute } = await import('./app')
    const Page = lazyRoute(() => Promise.resolve(() => <p>страница</p>))
    const el = document.createElement('div')
    render(<ErrorBoundary><Page /></ErrorBoundary>, el)
    await tick()
    expect(el.textContent).toBe('страница')
    render(null, el)
  })
})
