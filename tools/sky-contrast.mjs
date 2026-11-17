// Контраст текста карточки «Сейчас» на небе по времени суток (styles/wow-flow.css, цвета текста — styles/v1.css).
// Считает худшую точку по всей карточке: градиенты неба (слой .sky i, он на 20 % шире карточки с каждой стороны),
// свечение и дымка поверх, затем вуаль .sky::after. Запуск: node tools/sky-contrast.mjs
// Цифры в CSS и здесь должны совпадать: поменяли небо — поменяйте и тут, перезапустите.
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] }
const C = {
  sap: hex('#005A5C'), sapd: hex('#004C4E'), sapl: hex('#0A7275'), deep: hex('#00292C'), abyss: hex('#001A1C'),
  ember: hex('#F07A1E'), sand: hex('#F4EDE1'), white: [255, 255, 255], warm: hex('#FFC38F'), cool: hex('#9FE0DC'),
}
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const over = (fg, a, bg) => fg.map((v, i) => v * a + bg[i] * (1 - a))
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

/** linear-gradient(deg, stops) в точке (x, y) прямоугольника w × h */
function linear(deg, stops, x, y, w, h) {
  const a = (deg * Math.PI) / 180
  const len = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))
  const t = Math.min(1, Math.max(0, ((x - w / 2) * Math.sin(a) + (y - h / 2) * Math.cos(a)) / len + 0.5))
  for (let i = 1; i < stops.length; i++) {
    const [c0, p0] = stops[i - 1], [c1, p1] = stops[i]
    if (t <= p1) return mix(c0, c1, (t - p0) / (p1 - p0))
  }
  return stops[stops.length - 1][0]
}
/** radial-gradient(rw% rh% at cx% cy%, rgba(c, a), transparent end%): цвет и его прозрачность в точке */
function radial([rw, rh, cx, cy, c, a, end], x, y, w, h) {
  const t = Math.hypot((x - cx * w) / (rw * w), (y - cy * h) / (rh * h))
  return [c, t >= end ? 0 : a * (1 - t / end)]
}

/* Небо — как в wow-flow.css; scrim — вуаль .sky::after: [сверху, снизу] */
const SKY = {
  dawn: { lin: [180, [[C.deep, 0], [C.sapd, 0.45], [C.sapl, 1]]], rad: [[0.95, 0.3, 0.5, 0.84, C.ember, 0.5, 0.72], [1.2, 0.45, 0.5, 0.88, C.sand, 0.14, 0.72]], scrim: [0.18, 0.3] },
  day: { lin: [160, [[C.sapl, 0], [C.sap, 0.55], [C.sapd, 1]]], rad: [[0.55, 0.4, 0.86, 0.16, C.sand, 0.26, 0.7], [0.6, 0.5, 0, 1, C.deep, 0.35, 0.7]], scrim: [0.3, 0.18] },
  dusk: { lin: [185, [[C.deep, 0], [C.sapd, 0.48], [C.sap, 1]]], rad: [[0.85, 0.45, 0.1, 0.86, C.ember, 0.55, 0.68], [0.7, 0.3, 0.65, 0.86, C.ember, 0.22, 0.7]], scrim: [0.16, 0.28] },
  night: { lin: [170, [[C.deep, 0], [C.abyss, 1]]], rad: [[0.55, 0.4, 0.84, 0.18, C.sapl, 0.5, 0.7], [0.45, 0.25, 0.15, 0.86, C.ember, 0.12, 0.7]], scrim: [0, 0] },
}
/** Размеры карточки, px: телефон 360 и 320, низкая карточка, широкий экран */
const CARDS = [[328, 340], [288, 380], [328, 260], [560, 300]]
const GRID = 40

function bgAt(p, x, y, W, H) {
  const bw = W * 1.4, bh = H * 1.4
  let col = linear(p.lin[0], p.lin[1], x + 0.2 * W, y + 0.2 * H, bw, bh)
  for (const r of [...p.rad].reverse()) { const [c, a] = radial(r, x + 0.2 * W, y + 0.2 * H, bw, bh); col = over(c, a, col) }
  return over(C.abyss, p.scrim[0] + (p.scrim[1] - p.scrim[0]) * (y / H), col)
}

function pairs(bg, night) {
  const chip = night ? over(C.white, 0.1, bg) : over(C.deep, 0.22, bg)
  return {
    'kicker #FFC38F (small, 4.5)': ratio(C.warm, bg),
    'time #9FE0DC (small, 4.5)': ratio(C.cool, bg),
    'title #FFF (large, 3)': ratio(C.white, bg),
    'place #FFF .92 (4.5)': ratio(over(C.white, 0.92, bg), bg),
    'note #FFF on chip (4.5)': ratio(C.white, chip),
    'pay #FFC38F on chip (4.5)': ratio(C.warm, chip),
    'cta border #FFF .55 (UI, 3)': ratio(over(C.white, 0.55, bg), bg),
  }
}

const table = {}
for (const [name, p] of Object.entries(SKY)) {
  const worst = {}
  for (const [W, H] of CARDS) {
    for (let yi = 0; yi <= GRID; yi++) for (let xi = 0; xi <= GRID; xi++) {
      const x = (W * xi) / GRID, y = (H * yi) / GRID
      for (const [k, v] of Object.entries(pairs(bgAt(p, x, y, W, H), name === 'night'))) worst[k] = Math.min(worst[k] ?? Infinity, v)
    }
  }
  table[name] = Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, +v.toFixed(2)]))
}
console.table(table)
