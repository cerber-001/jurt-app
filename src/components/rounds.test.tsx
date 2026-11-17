// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'preact'
import { ROUNDS, RoundsDial, chime, clearRounds, hintsOf, isRounds, sound, toggleSound, useRounds, type Rounds } from './rounds'
import { ls } from '../lib/store'
import { lang } from '../lib/store'
import { memoryStorage } from '../../tests/helpers/memoryStorage'
import steps from '../../public/content/steps.json'

const box = () => document.createElement('div')

describe('isRounds', () => {
  test('счётчики кругов есть у тавафа и саи', () => {
    expect(isRounds('tawaf')).toBe(true)
    expect(isRounds('sai')).toBe(true)
  })
  test('у остальных шагов — нет', () => {
    for (const id of ['ghusl', 'ihram', 'halq', '', 'TAWAF']) expect(isRounds(id)).toBe(false)
  })
})

describe('ROUNDS', () => {
  test('семь кругов', () => { expect(ROUNDS).toBe(7) })
})

describe('hintsOf', () => {
  test('достаёт data-hint-1…7 по порядку', () => {
    const html = Array.from({ length: 7 }, (_, k) => `<div data-hint-${k + 1}="Круг ${k + 1}">`).join('')
    expect(hintsOf(html)).toEqual(['Круг 1', 'Круг 2', 'Круг 3', 'Круг 4', 'Круг 5', 'Круг 6', 'Круг 7'])
  })
  test('отсутствующие подсказки — пустые строки, длина всегда 7', () => {
    const h = hintsOf('<div data-hint-2="Второй">')
    expect(h).toHaveLength(7)
    expect(h).toEqual(['', 'Второй', '', '', '', '', ''])
  })
  test('пустой html — семь пустых строк', () => {
    expect(hintsOf('')).toEqual(Array(7).fill(''))
  })
  test('на реальном контенте шагов таваф и саи дают семь непустых подсказок', () => {
    for (const id of ['tawaf', 'sai']) {
      const step = (steps as { id: string; html: string }[]).find(s => s.id === id)!
      expect(hintsOf(step.html).every(Boolean), id).toBe(true)
    }
  })
})

describe('RoundsDial', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()) })
  afterEach(() => { lang.value = 'ru'; vi.unstubAllGlobals() })
  const hints = Array.from({ length: 7 }, (_, k) => `подсказка ${k + 1}`)

  test('показывает счёт и подсказку текущего круга', () => {
    const el = box()
    render(<RoundsDial id="tawaf" n={2} hints={hints} />, el)
    expect(el.querySelector('.dial-n b')?.textContent).toBe('2')
    expect(el.querySelector('.dial-hint')?.textContent).toBe('подсказка 3')
    expect(el.querySelectorAll('circle.on')).toHaveLength(2)
    expect(el.querySelectorAll('circle.cur')).toHaveLength(1)
    expect(el.querySelector('.dial.fin')).toBeNull()
  })

  test('на седьмом круге диск помечается завершённым и подсказка заменяется итоговой', () => {
    const el = box()
    render(<RoundsDial id="sai" n={7} hints={hints} />, el)
    expect(el.querySelector('.dial.fin')).not.toBeNull()
    expect(el.querySelector('.dial-hint')?.textContent).not.toBe('подсказка 7')
    expect(el.querySelector('.kicker')).toBeNull()
  })

  test('на других языках вместо русской подсказки — «единица + номер»', () => {
    lang.value = 'en'
    const el = box()
    render(<RoundsDial id="tawaf" n={3} hints={hints} />, el)
    expect(el.querySelector('.dial-hint')?.textContent).not.toContain('подсказка')
    expect(el.querySelector('.dial-hint')?.textContent).toMatch(/4$/)
  })
})

/** Счётчик в живом компоненте: кнопки дергают add/undo/reset, снаружи видим текущее n */
function Probe({ id, out }: { id: string; out: { r?: Rounds } }) {
  out.r = useRounds(id)
  return <b>{out.r.n}</b>
}

describe('useRounds — счёт кругов', () => {
  let el: HTMLDivElement
  const out: { r?: Rounds } = {}
  const mount = (id: string) => { el = box(); render(<Probe id={id} out={out} />, el) }
  const act = async (f: () => void) => { f(); await new Promise(r => setTimeout(r, 0)) }
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('navigator', { ...navigator, vibrate: vi.fn() })
    sound.value = false
  })
  afterEach(() => { render(null, el); vi.unstubAllGlobals() })

  test('+1 считает, хранит на телефоне и не уходит за семь', async () => {
    mount('tawaf')
    for (let k = 0; k < 9; k++) await act(() => out.r!.add())
    expect(out.r!.n).toBe(ROUNDS)
    expect(el.textContent).toBe('7')
    expect(ls.get('jurt.cnt-tawaf')).toBe('7')
  })

  test('седьмой круг — особая вибрация, обычный — короткая', async () => {
    mount('sai')
    await act(() => out.r!.add())
    expect(navigator.vibrate).toHaveBeenLastCalledWith(40)
    for (let k = 0; k < 6; k++) await act(() => out.r!.add())
    expect(navigator.vibrate).toHaveBeenLastCalledWith([70, 50, 70, 50, 140])
  })

  test('«убрать один» не уходит ниже нуля, «сначала» обнуляет', async () => {
    mount('tawaf')
    await act(() => out.r!.undo())
    expect(out.r!.n).toBe(0)
    await act(() => out.r!.add()); await act(() => out.r!.add())
    await act(() => out.r!.undo())
    expect(out.r!.n).toBe(1)
    await act(() => out.r!.reset())
    expect(out.r!.n).toBe(0)
    expect(ls.get('jurt.cnt-tawaf')).toBe('')
  })

  test('быстрое двойное касание до перерисовки считается дважды', async () => {
    mount('tawaf')
    const r = out.r!
    r.add(); r.add()                      // одна и та же отрисовка: n в ней ещё 0
    await act(() => undefined)
    expect(out.r!.n).toBe(2)
    expect(ls.get('jurt.cnt-tawaf')).toBe('2')
    out.r!.undo(); out.r!.undo()
    await act(() => undefined)
    expect(out.r!.n).toBe(0)
  })

  test('седьмой круг при частых касаниях: особая вибрация ровно один раз, за семь не уходит', async () => {
    ls.set('jurt.cnt-sai', '5')
    mount('sai')
    const r = out.r!
    r.add(); r.add(); r.add(); r.add()
    await act(() => undefined)
    expect(out.r!.n).toBe(ROUNDS)
    const finals = vi.mocked(navigator.vibrate).mock.calls.filter(c => Array.isArray(c[0]))
    expect(finals).toHaveLength(1)
    expect(navigator.vibrate).toHaveBeenCalledTimes(2)
  })

  test('сай считает отдельно от тавафа; clearRounds обнуляет оба', async () => {
    ls.set('jurt.cnt-tawaf', '7')
    mount('sai')
    await act(() => out.r!.add())
    expect(ls.get('jurt.cnt-sai')).toBe('1')
    expect(ls.get('jurt.cnt-tawaf')).toBe('7')
    clearRounds()
    expect(ls.get('jurt.cnt-sai') + ls.get('jurt.cnt-tawaf')).toBe('')
  })

  test('испорченное значение в хранилище читается как 0…7', () => {
    ls.set('jurt.cnt-tawaf', '99')
    mount('tawaf')
    expect(out.r!.n).toBe(7)
    ls.set('jurt.cnt-sai', 'abc')
    mount('sai')
    expect(out.r!.n).toBe(0)
  })
})

describe('звук по желанию', () => {
  const tones: number[] = []
  class FakeAudio {
    state = 'suspended'; currentTime = 0; destination = {}
    resume = vi.fn(() => { this.state = 'running'; return Promise.resolve() })
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (x: unknown) => x } }
    createOscillator() {
      const o = { type: '', frequency: { value: 0 }, connect: (x: unknown) => x, start: () => tones.push(o.frequency.value), stop() {} }
      return o
    }
  }
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('AudioContext', FakeAudio); tones.length = 0; sound.value = false })
  afterEach(() => { sound.value = false; vi.unstubAllGlobals() })

  test('браузер без Web Audio — без ошибок (первым: звук ещё ни разу не создавался)', () => {
    vi.stubGlobal('AudioContext', undefined)
    sound.value = true
    expect(() => chime(false)).not.toThrow()
  })

  test('по умолчанию звука нет', () => {
    chime(false)
    expect(tones).toEqual([])
  })

  const flush = () => new Promise(r => setTimeout(r, 0))

  test('включили — сразу пробный тон и запоминается на телефоне; выключили — тишина', async () => {
    toggleSound()
    expect(sound.value).toBe(true)
    expect(ls.get('jurt.snd')).toBe('1')
    await flush()                         // первый раз контекст «спит» — тон звучит, когда он проснулся
    expect(tones).toHaveLength(1)
    toggleSound()
    expect(ls.get('jurt.snd')).toBe('')
    chime(true)
    expect(tones).toHaveLength(1)
  })

  test('на седьмом круге — два тона', async () => {
    sound.value = true
    chime(true)
    await flush()
    expect(tones).toHaveLength(2)
  })
})

describe('звук после звонка на iPhone (контекст «interrupted»)', () => {
  const tones: number[] = []
  let resumeOk = true
  const made: { state: string; resume: ReturnType<typeof vi.fn> }[] = []
  class Interrupted {
    state = 'interrupted'; currentTime = 0; destination = {}
    resume = vi.fn(() => {
      if (!resumeOk) return Promise.reject(new Error('not allowed'))
      this.state = 'running'; return Promise.resolve()
    })
    constructor() { made.push(this) }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (x: unknown) => x } }
    createOscillator() {
      const o = { type: '', frequency: { value: 0 }, connect: (x: unknown) => x, start: () => tones.push(o.frequency.value), stop() {} }
      return o
    }
  }
  const fresh = async () => { vi.resetModules(); return import('./rounds') }
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('AudioContext', Interrupted); tones.length = 0; made.length = 0; resumeOk = true })
  afterEach(() => { vi.unstubAllGlobals() })

  test('будит контекст и играет только после того, как он проснулся', async () => {
    const m = await fresh()
    m.sound.value = true
    m.chime(false)
    expect(made[0].resume).toHaveBeenCalledTimes(1)
    expect(tones).toEqual([])            // ещё спит — тон не теряется в тишине, а ждёт
    await new Promise(r => setTimeout(r, 0))
    expect(tones).toHaveLength(1)
    m.chime(false)                        // уже работает — сразу
    expect(tones).toHaveLength(2)
    expect(made[0].resume).toHaveBeenCalledTimes(1)
  })

  test('не проснулся — тихо, без ошибок', async () => {
    resumeOk = false
    const m = await fresh()
    m.sound.value = true
    expect(() => m.chime(true)).not.toThrow()
    await new Promise(r => setTimeout(r, 0))
    expect(tones).toEqual([])
  })
})
