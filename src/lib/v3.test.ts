// @vitest-environment jsdom
/* Заметки устаза: код группы в фильтре .or() — только проверенный; живые обновления пробуют подключиться
   ещё раз, когда вернулась сеть (библиотека Supabase не загрузилась офлайн). */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const getSupabase = vi.fn()
vi.mock('./supabase', () => ({ getSupabase: () => getSupabase() }))
const { listNotes, onNotes } = await import('./v3')

/** Поддельный построитель запроса: запоминает вызовы .or() и .is() */
function fakeQuery() {
  const calls: { or: string[]; is: unknown[][] } = { or: [], is: [] }
  const q = {
    select: () => q, order: () => q,
    or: (f: string) => { calls.or.push(f); return q },
    is: (...a: unknown[]) => { calls.is.push(a); return q },
    then: (res: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(res),
  }
  getSupabase.mockResolvedValue({ from: () => q })
  return calls
}

/** Поддельный клиент Realtime */
function fakeRealtime() {
  const ch = { on: () => ch, subscribe: () => ch }
  return { client: { channel: vi.fn(() => ch), removeChannel: vi.fn() }, ch }
}

const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => { getSupabase.mockReset() })
afterEach(() => { vi.restoreAllMocks() })

describe('listNotes — фильтр по коду группы', () => {
  test('настоящий код попадает в фильтр заглавными', async () => {
    const calls = fakeQuery()
    await listNotes('umra-0010')
    expect(calls.or).toEqual(['trip_code.is.null,trip_code.eq.UMRA-0010'])
  })

  test('то, что не похоже на код, в фильтр не попадает — только общие заметки', async () => {
    for (const bad of ['X),id.neq.0', 'UMRA-0010,trip_code.is.null', 'UMRA 0010', 'UMRA-12', '']) {
      const calls = fakeQuery()
      await listNotes(bad)
      expect(calls.or, bad).toEqual([])
      expect(calls.is, bad).toEqual([['trip_code', null]])
    }
  })
})

describe('onNotes — живые обновления', () => {
  test('без сети не подключились — один раз пробуем снова, когда сеть вернулась', async () => {
    const { client } = fakeRealtime()
    getSupabase.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(client)
    const stop = onNotes(() => undefined)
    await flush()
    expect(client.channel).not.toHaveBeenCalled()
    dispatchEvent(new Event('online'))
    await flush()
    expect(client.channel).toHaveBeenCalledTimes(1)
    dispatchEvent(new Event('online'))       // повтор — только один
    await flush()
    expect(getSupabase).toHaveBeenCalledTimes(2)
    stop()
    expect(client.removeChannel).toHaveBeenCalledTimes(1)
  })

  test('повтор тоже не удался — больше не пробуем, без ошибок', async () => {
    getSupabase.mockRejectedValue(new Error('offline'))
    const stop = onNotes(() => undefined)
    await flush()
    dispatchEvent(new Event('online'))
    await flush()
    dispatchEvent(new Event('online'))
    await flush()
    expect(getSupabase).toHaveBeenCalledTimes(2)
    stop()
  })

  test('отписались до возвращения сети — повторной попытки нет', async () => {
    const { client } = fakeRealtime()
    getSupabase.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(client)
    const stop = onNotes(() => undefined)
    await flush()
    stop()
    dispatchEvent(new Event('online'))
    await flush()
    expect(getSupabase).toHaveBeenCalledTimes(1)
    expect(client.channel).not.toHaveBeenCalled()
  })
})
