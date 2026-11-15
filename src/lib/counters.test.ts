// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { hydrateCounters } from './counters'
import { memoryStorage } from '../../tests/helpers/memoryStorage'

const KEY = 'jurt.cnt-tawaf'
const hints = Array.from({ length: 7 }, (_, k) => `data-hint-${k + 1}="Подсказка ${k + 1}"`).join(' ')

function mount(id = 'tawaf'): HTMLElement {
  document.body.innerHTML = `
    <div id="root">
      <div class="counter" data-id="${id}" data-unit="круг" data-plural="кругов" ${hints}>
        <button class="ringbtn"><svg><circle class="fg"></circle></svg><span class="core"></span></button>
        <span class="n"></span><span class="lab"></span><span class="tap"></span>
        <div class="dots7">${'<span></span>'.repeat(7)}</div>
        <div class="crow"><button class="minus"></button><button class="zero"></button></div>
      </div>
    </div>
    <div class="sai-sch" data-dir="sm"></div>`
  const root = document.getElementById('root') as HTMLElement
  hydrateCounters(root)
  return root
}
const q = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T
const click = (s: string) => q(s).dispatchEvent(new MouseEvent('click', { bubbles: true }))
const dotsOn = () => document.querySelectorAll('.dots7 span.on').length

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); document.body.innerHTML = '' })
afterEach(() => { vi.unstubAllGlobals() })

describe('hydrateCounters', () => {
  test('без корня ничего не делает', () => {
    expect(() => hydrateCounters(null)).not.toThrow()
  })

  test('пустой счётчик: 0/7, первая подсказка и нулевой прогресс', () => {
    mount()
    expect(q('.n').textContent).toBe('0/7')
    expect(q('.lab').textContent).toBe('Подсказка 1')
    expect(q('.tap').textContent).toBe('в конце круга')
    expect(dotsOn()).toBe(0)
  })

  test('нажатие кольца увеличивает счёт и сохраняет его в localStorage под jurt.cnt-<id>', () => {
    mount()
    click('.ringbtn'); click('.ringbtn')
    expect(localStorage.getItem(KEY)).toBe('2')
    expect(q('.n').textContent).toBe('2/7')
    expect(q('.lab').textContent).toBe('Подсказка 3')
    expect(dotsOn()).toBe(2)
  })

  test('счёт восстанавливается из хранилища при новой отрисовке', () => {
    localStorage.setItem(KEY, '4')
    mount()
    expect(q('.n').textContent).toBe('4/7')
    expect(dotsOn()).toBe(4)
  })

  test('повторная гидратация не навешивает второй обработчик', () => {
    const root = mount()
    hydrateCounters(root)
    click('.ringbtn')
    expect(localStorage.getItem(KEY)).toBe('1')
  })

  test('после седьмого круга — финал и дальше счёт не растёт', () => {
    mount()
    for (let k = 0; k < 9; k++) click('.ringbtn')
    expect(localStorage.getItem(KEY)).toBe('7')
    expect(q('.lab').textContent).toBe('Все 7 кругов · аль-хамду ли-Лляхь')
    expect(q('.tap').textContent).toBe('✓ готово')
    expect(q('.ringbtn').classList.contains('fin')).toBe(true)
  })

  test('«минус» уменьшает счёт, но не ниже нуля; ноль стирает ключ', () => {
    mount()
    click('.ringbtn')
    click('.minus'); click('.minus')
    expect(q('.n').textContent).toBe('0/7')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  test('«сначала» спрашивает подтверждение: отказ сохраняет счёт, согласие обнуляет', () => {
    mount()
    click('.ringbtn'); click('.ringbtn')
    const confirmSpy = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirmSpy)
    click('.zero')
    expect(localStorage.getItem(KEY)).toBe('2')
    click('.zero')
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(confirmSpy).toHaveBeenCalledTimes(2)
  })

  test('без подсказки в разметке берётся «единица + номер»', () => {
    document.body.innerHTML = `<div id="root"><div class="counter" data-id="x" data-unit="проход" data-plural="проходов">
      <span class="lab"></span><span class="n"></span></div></div>`
    hydrateCounters(document.getElementById('root'))
    expect(q('.lab').textContent).toBe('проход 1')
  })

  test('счётчик саи переключает схему: чётный отрезок — sm, нечётный — ms, конец — fin', () => {
    mount('sai')
    const dir = () => q('.sai-sch').dataset.dir
    expect(dir()).toBe('sm')
    click('.ringbtn'); expect(dir()).toBe('ms')
    click('.ringbtn'); expect(dir()).toBe('sm')
    for (let k = 0; k < 5; k++) click('.ringbtn')
    expect(dir()).toBe('fin')
  })

  test('мусор в хранилище читается как 0', () => {
    localStorage.setItem(KEY, 'abc')
    mount()
    expect(q('.n').textContent).toBe('0/7')
  })
})
