import { beforeEach, describe, expect, test, vi } from 'vitest'

/* Клиент Supabase грузится только по требованию: тяжёлая библиотека не должна попадать
   в первый экран «Сейчас». Проверяем, что модуль не создаёт клиент при импорте и создаёт его один раз. */
const createClient = vi.fn(() => ({ id: Math.random() }))
vi.mock('@supabase/supabase-js', () => ({ createClient }))

beforeEach(() => { vi.resetModules(); createClient.mockClear() })

describe('getSupabase', () => {
  test('импорт модуля не создаёт клиент', async () => {
    await import('./supabase')
    expect(createClient).not.toHaveBeenCalled()
  })

  test('первый вызов создаёт клиент без сохранения сессии', async () => {
    const { getSupabase } = await import('./supabase')
    await getSupabase()
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(createClient.mock.calls[0]).toHaveLength(3)
    expect((createClient.mock.calls[0] as unknown[])[2]).toEqual({ auth: { persistSession: false } })
  })

  test('повторные и одновременные вызовы отдают один и тот же клиент', async () => {
    const { getSupabase } = await import('./supabase')
    const [a, b] = await Promise.all([getSupabase(), getSupabase()])
    const c = await getSupabase()
    expect(a).toBe(b)
    expect(a).toBe(c)
    expect(createClient).toHaveBeenCalledTimes(1)
  })

  test('в браузере библиотека грузится только когда страница освободилась', async () => {
    let idle: (() => void) | null = null
    vi.stubGlobal('document', { readyState: 'complete' })
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => { idle = cb; return 1 })
    try {
      const { getSupabase } = await import('./supabase')
      const p = getSupabase()
      await Promise.resolve()
      expect(createClient).not.toHaveBeenCalled()
      expect(idle).not.toBeNull()
      idle!()
      await p
      expect(createClient).toHaveBeenCalledTimes(1)
    } finally { vi.unstubAllGlobals() }
  })

  test('после сбоя загрузки следующий вызов пробует снова', async () => {
    createClient.mockImplementationOnce(() => { throw new Error('нет сети') })
    const { getSupabase } = await import('./supabase')
    await expect(getSupabase()).rejects.toThrow('нет сети')
    await expect(getSupabase()).resolves.toBeTruthy()
    expect(createClient).toHaveBeenCalledTimes(2)
  })
})
