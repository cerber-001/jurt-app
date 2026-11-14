/* Оживление счётчиков-колец тавафа и саи из steps.json (перенос из гида v2).
   Разметка: .counter[data-id][data-unit][data-plural][data-hint-N] > button.ringbtn, .dots7, .crow (.minus/.zero). */
import { ls } from './store'

const C = 2 * Math.PI * 58
let lock: { release(): unknown } | null = null

function paint(c: HTMLElement) {
  const id = c.dataset.id || '', unit = c.dataset.unit || '', plural = c.dataset.plural || ''
  const n = +ls.get('jurt.cnt-' + id) || 0
  const q = (s: string) => c.querySelector<HTMLElement>(s)
  const fg = q('.fg'); if (fg) fg.style.strokeDashoffset = String(C * (1 - n / 7))
  const num = q('.n'); if (num) num.innerHTML = n + '<small>/7</small>'
  c.querySelectorAll('.dots7 span').forEach((s, i) => s.classList.toggle('on', i < n))
  q('.ringbtn')?.classList.toggle('fin', n >= 7)
  const lab = q('.lab'); if (lab) lab.textContent = n >= 7 ? 'Все 7 ' + plural + ' · аль-хамду ли-Лляхь' : (c.dataset['hint-' + (n + 1)] || c.getAttribute('data-hint-' + (n + 1)) || unit + ' ' + (n + 1))
  const tap = q('.tap'); if (tap) tap.textContent = n >= 7 ? '✓ готово' : 'в конце ' + unit + 'а'
  if (id === 'sai') document.querySelectorAll<HTMLElement>('.sai-sch').forEach(s => (s.dataset.dir = n >= 7 ? 'fin' : n % 2 ? 'ms' : 'sm'))
}

function set(c: HTMLElement, n: number) {
  ls.set('jurt.cnt-' + c.dataset.id, n ? String(n) : '')
  paint(c)
}

export function hydrateCounters(root: HTMLElement | null) {
  root?.querySelectorAll<HTMLElement>('.counter[data-id]').forEach(c => {
    paint(c)
    if (c.dataset.h) return
    c.dataset.h = '1'
    const get = () => +ls.get('jurt.cnt-' + c.dataset.id) || 0
    c.querySelector('.ringbtn')?.addEventListener('click', () => {
      const n = get(); if (n >= 7) return
      if (!lock) (navigator as any).wakeLock?.request('screen').then((l: any) => { lock = l; l.addEventListener?.('release', () => (lock = null)) }).catch(() => {})
      const core = c.querySelector('.core')
      if (core) { const r = document.createElement('span'); r.className = 'rip'; r.style.cssText = 'left:50%;top:50%;width:40px;height:40px;margin:-20px'; core.appendChild(r); setTimeout(() => r.remove(), 650) }
      navigator.vibrate?.(n + 1 === 7 ? [70, 50, 70, 50, 140] : 40)
      set(c, n + 1)
      const num = c.querySelector('.n'); num?.classList.remove('bump'); void (num as HTMLElement)?.offsetWidth; num?.classList.add('bump')
    })
    c.querySelector('.minus')?.addEventListener('click', () => set(c, Math.max(0, get() - 1)))
    c.querySelector('.zero')?.addEventListener('click', () => { if (confirm('Начать счёт заново?')) set(c, 0) })
  })
}
