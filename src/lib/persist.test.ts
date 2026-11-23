/* Просьба к браузеру хранить офлайн-копию гида постоянно (navigator.storage.persist) */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { askPersist, forgetPersistAsk } from './persist'

const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const FIREFOX_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:132.0) Gecko/20100101 Firefox/132.0'
const FIREFOX_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15'

function stubStorage(opts: { persisted?: boolean; fails?: boolean } = {}) {
  const persist = vi.fn(() => (opts.fails ? Promise.reject(new Error('нет')) : Promise.resolve(true)))
  const persisted = vi.fn(() => Promise.resolve(opts.persisted ?? false))
  return { persist, persisted }
}

function stubNavigator(ua: string, storage?: object) {
  vi.stubGlobal('navigator', { userAgent: ua, ...(storage ? { storage } : {}) })
}

beforeEach(() => forgetPersistAsk())
afterEach(() => vi.unstubAllGlobals())

describe('askPersist', () => {
  test('iPhone Safari: хранилище ещё не постоянное — просит persist() один раз', async () => {
    const s = stubStorage()
    stubNavigator(SAFARI_IPHONE, s)
    await askPersist()
    await askPersist()
    expect(s.persist).toHaveBeenCalledTimes(1)
  })

  test('уже постоянное — не просит снова', async () => {
    const s = stubStorage({ persisted: true })
    stubNavigator(SAFARI_IPHONE, s)
    await askPersist()
    expect(s.persist).not.toHaveBeenCalled()
  })

  test('нет navigator.storage — тихо ничего не делает', async () => {
    stubNavigator(SAFARI_IPHONE)
    await expect(askPersist()).resolves.toBeUndefined()
  })

  test('Firefox на компьютере — не просит (там всплывает окно разрешения)', async () => {
    const s = stubStorage()
    stubNavigator(FIREFOX_DESKTOP, s)
    await askPersist()
    expect(s.persist).not.toHaveBeenCalled()
  })

  test('Firefox на iPhone — это WebKit, окна нет: просит', async () => {
    const s = stubStorage()
    stubNavigator(FIREFOX_IOS, s)
    await askPersist()
    expect(s.persist).toHaveBeenCalledTimes(1)
  })

  test('браузер отказал с ошибкой — ошибка не выходит наружу', async () => {
    const s = stubStorage({ fails: true })
    stubNavigator(SAFARI_IPHONE, s)
    await expect(askPersist()).resolves.toBeUndefined()
  })
})
