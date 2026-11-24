/* Толпа: столкновения (со старой страницы haram3d v3.9, упрощено): каждый человек — кружок на полу.
   Соседи по сетке 1 × 1 м расталкиваются пополам; взрослый и ребёнок за руку двигаются вместе; после каждого прохода —
   выталкивание из препятствий (pushOut задаёт вызывающий). Смещение помнится между кадрами и медленно гаснет —
   обходят плавно, без дрожи. Всё на типизированных массивах без новых объектов в кадре: людей тысячи. */

export interface Grid { x0: number; y0: number; w: number; h: number }

/** Выталкивание из препятствий: поправить место человека a (через s.move — вместе с его парой) */
export type PushOut = (s: Solver, a: number) => void

const DECAY = 0.96
/** Смещение от своей дорожки, которое помнится, не больше 1,5 м */
const MAX_OFF = 1.5
const TAU = Math.PI * 2

export class Solver {
  n = 0
  readonly x: Float32Array
  readonly y: Float32Array
  readonly bx: Float32Array
  readonly by: Float32Array
  readonly r: Float32Array
  readonly id: Int32Array
  readonly mate: Int32Array
  private readonly next: Int32Array
  private readonly head: Int32Array
  private ox: Float32Array
  private oy: Float32Array
  private px: Float32Array
  private py: Float32Array

  readonly cap: number
  readonly grid: Grid

  /** cap — людей в кадре, ids — постоянных номеров (по ним помнится смещение) */
  constructor(cap: number, grid: Grid, ids: number) {
    this.cap = cap; this.grid = grid
    const f = (k: number) => new Float32Array(k)
    this.x = f(cap); this.y = f(cap); this.bx = f(cap); this.by = f(cap); this.r = f(cap)
    this.id = new Int32Array(cap); this.mate = new Int32Array(cap); this.next = new Int32Array(cap)
    this.head = new Int32Array(grid.w * grid.h)
    this.ox = f(ids); this.oy = f(ids); this.px = f(ids).fill(1e9); this.py = f(ids)
  }

  begin(): void { this.n = 0 }

  /** Человек: место по дорожке (x, y), радиус, постоянный номер (по нему помнится смещение) */
  add(x: number, y: number, r: number, id: number, jump: boolean): number {
    if (this.n >= this.cap) return -1
    const a = this.n++
    this.bx[a] = x; this.by[a] = y; this.r[a] = r; this.id[a] = id; this.mate[a] = -1
    if (jump || Math.abs(x - this.px[id]) + Math.abs(y - this.py[id]) > 2) { this.ox[id] = 0; this.oy[id] = 0 }
    this.px[id] = x; this.py[id] = y
    this.x[a] = x + this.ox[id] * DECAY; this.y[a] = y + this.oy[id] * DECAY
    return a
  }

  /** Взрослый a и ребёнок b за руку: ребёнок берёт смещение взрослого */
  pair(a: number, b: number): void {
    if (a < 0 || b < 0) return
    this.mate[a] = b; this.mate[b] = a
    this.x[b] = this.bx[b] + this.x[a] - this.bx[a]; this.y[b] = this.by[b] + this.y[a] - this.by[a]
  }

  /** Сдвинуть человека (и его пару) */
  move(a: number, mx: number, my: number): void {
    this.x[a] += mx; this.y[a] += my
    const m = this.mate[a]
    if (m >= 0) { this.x[m] += mx; this.y[m] += my }
  }

  private build(): void {
    const { x0, y0, w, h } = this.grid
    this.head.fill(-1)
    for (let a = 0; a < this.n; a++) {
      const i = Math.floor(this.x[a]) - x0, j = Math.floor(this.y[a]) - y0
      if (i < 0 || j < 0 || i >= w || j >= h) { this.next[a] = -2; continue }
      const c = i + j * w
      this.next[a] = this.head[c]; this.head[c] = a
    }
  }

  /** Развести a с соседями b > a; вернуть сумму заметных (> 3 см) наложений */
  private pairs(a: number): number {
    const { x0, y0, w, h } = this.grid, ci = Math.floor(this.x[a]) - x0, cj = Math.floor(this.y[a]) - y0, ma = this.mate[a]
    let pen = 0
    for (let i = Math.max(0, ci - 1); i <= Math.min(w - 1, ci + 1); i++) for (let j = Math.max(0, cj - 1); j <= Math.min(h - 1, cj + 1); j++)
      for (let b = this.head[i + j * w]; b >= 0; b = this.next[b]) {
        if (b <= a || b === ma) continue
        let dx = this.x[b] - this.x[a], dy = this.y[b] - this.y[a]
        const rr = this.r[a] + this.r[b], d2 = dx * dx + dy * dy
        if (d2 >= rr * rr) continue
        let d = Math.sqrt(d2)
        if (d < 1e-4) { const g = (a * 2.399) % TAU; dx = Math.cos(g); dy = Math.sin(g); d = 1 }   // точно друг в друге — расходятся в постоянную сторону
        const p = rr - (d2 < 1e-8 ? 0 : d), ux = dx / d, uy = dy / d
        if (p > 0.03) pen += p
        this.move(a, -ux * p * 0.5, -uy * p * 0.5)
        this.move(b, ux * p * 0.5, uy * p * 0.5)
      }
    return pen
  }

  /** Несколько проходов; заметных наложений не осталось — дальше не считаем */
  solve(iters: number, pushOut: PushOut | null): void {
    for (let it = 0; it < iters; it++) {
      this.build()
      let pen = 0
      for (let a = 0; a < this.n; a++) if (this.next[a] !== -2) pen += this.pairs(a)
      if (pushOut) for (let a = 0; a < this.n; a++) pushOut(this, a)
      if (it >= 1 && pen === 0) break
    }
    for (let a = 0; a < this.n; a++) {
      const id = this.id[a]
      let dx = this.x[a] - this.bx[a], dy = this.y[a] - this.by[a]
      const l = Math.hypot(dx, dy)
      if (l > MAX_OFF) { dx *= MAX_OFF / l; dy *= MAX_OFF / l }
      this.ox[id] = dx; this.oy[id] = dy
    }
  }

  /** Число наложений (ближе суммы радиусов − 5 см), не считая пар «взрослый — ребёнок»: для тестов и проверки */
  overlaps(): number {
    let k = 0
    for (let a = 0; a < this.n; a++) for (let b = a + 1; b < this.n; b++) {
      if (this.mate[a] === b) continue
      const d = Math.hypot(this.x[b] - this.x[a], this.y[b] - this.y[a])
      if (d < this.r[a] + this.r[b] - 0.05) k++
    }
    return k
  }
}
