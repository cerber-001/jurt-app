// @vitest-environment jsdom
/* Карточка «Харам заранее (3D)»: ленивый импорт окна (замокан), «Загружается…», ошибка → «Попробовать снова»,
   отметка «сохранено для поездки без сети» — только если вся модель в кэше и есть caches */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { memoryStorage } from '../../../tests/helpers/memoryStorage'
import { lang } from '../../lib/store'

const viewerMounted = vi.hoisted(() => vi.fn())
vi.mock('../haram3d/viewer', () => ({
  Haram3dViewer: ({ onClose }: { onClose: () => void }) => {
    viewerMounted()
    return <div class="fake-viewer"><button onClick={onClose}>закрыть</button></div>
  },
}))

import { Haram3dCard, Haram3dOverlay, haram3dOpen, viewerLoader } from './haram3d-card'

let root: HTMLDivElement
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); await new Promise(r => setTimeout(r, 0)) })
const show = async () => { await act(() => { render(<><Haram3dCard /><Haram3dOverlay /></>, root) }); await flush() }
const button = () => root.querySelector<HTMLButtonElement>('.jr-3d button')!

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  viewerMounted.mockClear()
  root = document.createElement('div'); document.body.append(root)
})
afterEach(async () => {
  await act(() => { haram3dOpen.value = false })
  await act(() => { render(null, root) })
  root.remove()
  lang.value = 'ru'
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})

describe('карточка 3D', () => {
  test('по кнопке — ленивый импорт окна и открытие поверх экрана', async () => {
    await show()
    expect(root.querySelector('.fake-viewer')).toBeNull()
    await act(() => { button().click() })
    await flush()
    expect(haram3dOpen.value).toBe(true)
    expect(viewerMounted).toHaveBeenCalled()
    expect(root.querySelector('.fake-viewer')).not.toBeNull()
    // закрыли — окна нет, карточка на месте
    await act(() => { root.querySelector<HTMLButtonElement>('.fake-viewer button')!.click() })
    expect(haram3dOpen.value).toBe(false)
    expect(root.querySelector('.fake-viewer')).toBeNull()
  })

  test('пока файл окна грузится — «Загружается…», повторное нажатие ничего не делает', async () => {
    let done!: (v: unknown) => void
    vi.spyOn(viewerLoader, 'load').mockImplementationOnce(() => new Promise(r => { done = r }) as never)
    await show()
    await act(() => { button().click() })
    expect(button().textContent).toBe('Загружается…')
    expect(button().getAttribute('aria-disabled')).toBe('true')
    await act(() => { button().click() })   // повторное нажатие во время загрузки — без второго импорта
    expect(viewerLoader.load).toHaveBeenCalledTimes(1)
    expect(button().getAttribute('aria-busy')).toBe('true')
    await act(async () => { done(() => null); await Promise.resolve() })
  })

  test('карточку убрали с экрана, пока грузился файл окна, — окно не открывается само', async () => {
    let done!: (v: unknown) => void
    vi.spyOn(viewerLoader, 'load').mockImplementationOnce(() => new Promise(r => { done = r }) as never)
    await show()
    await act(() => { button().click() })
    await act(() => { render(null, root) })
    await act(async () => { done(() => null); await Promise.resolve(); await Promise.resolve() })
    expect(haram3dOpen.value).toBe(false)
  })

  test('импорт упал (нет сети, файла нет в кэше) — честная строка и «Попробовать снова», повтор открывает окно', async () => {
    vi.spyOn(viewerLoader, 'load').mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
    await show()
    await act(() => { button().click() })
    await flush()
    expect(root.querySelector('[role=status]')!.textContent).toBe('3D не загрузилось. Проверьте интернет.')
    expect(button().textContent).toBe('Попробовать снова')
    expect(haram3dOpen.value).toBe(false)
    await act(() => { button().click() })
    await flush()
    expect(haram3dOpen.value).toBe(true)
    expect(root.querySelector('.fake-viewer')).not.toBeNull()
  })

  test('вся модель в кэше — «Наша модель сохранена — откроется и без сети»', async () => {
    const match = vi.fn((_u: string) => Promise.resolve(new Response('x')))
    vi.stubGlobal('caches', { match })
    await show()
    // «сохранено» — только если в кэше и путь от отеля, и всё из каталога с версией
    expect(match.mock.calls.map(c => c[0])).toContain('/haram3d/v1/walk_route.json')
    expect(root.querySelector('.jr-3d-saved')?.textContent).toContain('Наша модель сохранена — откроется и без сети')
  })

  test('в кэше не всё — отметки нет', async () => {
    vi.stubGlobal('caches', { match: vi.fn((u: string) => Promise.resolve(u.endsWith('walk_route.json') ? undefined : new Response('x'))) })
    await show()
    expect(root.querySelector('.jr-3d-saved')).toBeNull()
  })

  test('браузер без caches — молчим', async () => {
    vi.stubGlobal('caches', undefined)
    await show()
    expect(root.querySelector('.jr-3d-saved')).toBeNull()
    expect(root.querySelector('.jr-3d')!.textContent).toContain('Открыть 3D')
  })

  test('по-английски — «Open 3D»', async () => {
    lang.value = 'en'
    await show()
    expect(button().textContent).toBe('Open 3D')
  })
})
