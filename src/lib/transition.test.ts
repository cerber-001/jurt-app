import { describe, expect, it, vi } from 'vitest'
import { canTransition, runTransition, type TransitionEnv } from './transition'

/** Документ-заглушка: startViewTransition как в браузере — колбэк вызывается позже, не сразу */
function fakeDoc(withApi = true) {
  const root = { dataset: {} as Record<string, string | undefined> }
  const calls: (() => unknown)[] = []
  const doc = {
    documentElement: root,
    startViewTransition: withApi
      ? vi.fn((cb: () => unknown) => {
          calls.push(cb)
          return { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: Promise.resolve() }
        })
      : undefined,
  }
  return { doc, root, calls }
}

const env = (doc: unknown, reduced = false): TransitionEnv => ({ doc: doc as TransitionEnv['doc'], reduced })

describe('canTransition — плавный переход только там, где браузер умеет и человек не просил «меньше движения»', () => {
  it('есть View Transitions и движение не ограничено — да', () => expect(canTransition(env(fakeDoc().doc))).toBe(true))
  it('браузер не умеет — нет (без полифиллов)', () => expect(canTransition(env(fakeDoc(false).doc))).toBe(false))
  it('«Уменьшить движение» — нет', () => expect(canTransition(env(fakeDoc().doc, true))).toBe(false))
  it('документа нет (тесты, сервер) — нет', () => expect(canTransition({ doc: undefined, reduced: false })).toBe(false))
})

describe('runTransition — смена экрана', () => {
  it('без View Transitions — меняет сразу, синхронно', () => {
    const { doc } = fakeDoc(false), update = vi.fn()
    runTransition(update, 'tab', env(doc))
    expect(update).toHaveBeenCalledOnce()
  })

  it('при «Уменьшить движение» — меняет сразу и браузерный переход не запускает', () => {
    const { doc } = fakeDoc(), update = vi.fn()
    runTransition(update, 'tab', env(doc, true))
    expect(update).toHaveBeenCalledOnce()
    expect(doc.startViewTransition).not.toHaveBeenCalled()
  })

  it('с View Transitions — меняет внутри перехода и помечает его вид для CSS', async () => {
    const { doc, root, calls } = fakeDoc(), update = vi.fn()
    runTransition(update, 'hero', env(doc))
    expect(update).not.toHaveBeenCalled()            // старый вид ещё снимается
    expect(root.dataset.vt).toBe('hero')
    await calls[0]()
    expect(update).toHaveBeenCalledOnce()
    await new Promise(r => setTimeout(r, 0))
    expect(root.dataset.vt).toBeUndefined()          // переход закончился — пометка снята
  })

  it('браузер отказал в переходе (бросил ошибку) — экран всё равно меняется', () => {
    const { doc, root } = fakeDoc(), update = vi.fn()
    doc.startViewTransition = vi.fn(() => { throw new Error('InvalidStateError') })
    runTransition(update, 'tab', env(doc))
    expect(update).toHaveBeenCalledOnce()
    expect(root.dataset.vt).toBeUndefined()
  })

  it('переход прерван — обещания отклонены, но без «необработанных» ошибок', async () => {
    const { doc, calls } = fakeDoc(), update = vi.fn()
    const fail = () => Promise.reject(new Error('AbortError'))
    doc.startViewTransition = vi.fn((cb: () => unknown) => { calls.push(cb); return { ready: fail(), updateCallbackDone: fail(), finished: fail() } })
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    runTransition(update, 'tab', env(doc))
    await calls[0]()
    await new Promise(r => setTimeout(r, 10))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledOnce()
  })
})

describe('tabKind — направление перехода по нижнему меню', () => {
  it('вправо (Сейчас → Путь) — вперёд', async () => expect((await import('./transition')).tabKind(0, 10)).toBe('tab'))
  it('влево (Ещё → Группа) — назад', async () => expect((await import('./transition')).tabKind(30, 20)).toBe('tab-back'))
  it('тот же раздел — вперёд (без разницы)', async () => expect((await import('./transition')).tabKind(10, 10)).toBe('tab'))
})
