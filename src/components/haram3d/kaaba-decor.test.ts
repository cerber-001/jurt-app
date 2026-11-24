// @vitest-environment jsdom
/* Убранство Каабы (kaaba-decor.ts, kaaba-sitara.ts): тексты — символ в символ из сверки кисвы 23.11.2026, подсчёты
   (16 кусков хизама, 4 самадии, 12 ламп, 6 рамок, 60 колец), узлы props.glb, накладки на стенах, шрифт.
   В jsdom нет canvas — 2D-контекст подменён записью вызовов fillText (рисование не проверяем) */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, BoxGeometry, Vector3, type InstancedMesh, type Object3D, type PlaneGeometry } from 'three'
import { PROP_NODES, isForbiddenNode, MODEL_BASE } from '../../lib/haram3d'
import { buildKaabaDecor, kaabaFontReady, type KaabaMeta } from './kaaba-decor'
import { layoutText, splitHalf } from './kaaba-shaders'
import {
  HIZAM, IKHLAS, JACQUARD, LAMPS, SITARA_BANDS, SITARA_FATH, SITARA_MEDALLIONS, SITARA_TAWHID, SITARA_ZUMAR, UNDER_HIZAM,
} from './kaaba-texts'

/* Ожидаемые строки — из отчёта «Гид_паломника_Сверка_кисвы_23.11.2026.md», раздел 5 (П1–П4), символ в символ (сверка 23.11.2026) */
const EXP_HIZAM = [
  [
    'بسم الله الرحمن الرحيم وإذ جعلنا البيت مثابة للناس وأمنا واتخذوا من مقام إبراهيم مصلى',
    'وعهدنا إلى إبراهيم وإسماعيل أن طهرا بيتي للطائفين والعاكفين والركع السجود',
    'وإذ يرفع إبراهيم القواعد من البيت وإسماعيل ربنا تقبل منا إنك أنت السميع العليم',
    'ربنا واجعلنا مسلمين لك ومن ذريتنا أمة مسلمة لك وأرنا مناسكنا وتب علينا إنك أنت التواب الرحيم',
  ],
  [
    'بسم الله الرحمن الرحيم الحج أشهر معلومات فمن فرض فيهن الحج فلا رفث ولا فسوق ولا جدال في الحج',
    'وما تفعلوا من خير يعلمه الله وتزودوا فإن خير الزاد التقوى واتقون يا أولي الألباب',
    'ليس عليكم جناح أن تبتغوا فضلا من ربكم فإذا أفضتم من عرفات فاذكروا الله عند المشعر الحرام',
    'واذكروه كما هداكم وإن كنتم من قبله لمن الضالين ثم أفيضوا من حيث أفاض الناس واستغفروا الله إن الله غفور رحيم',
  ],
  [
    'وإذ بوأنا لإبراهيم مكان البيت أن لا تشرك بي شيئا وطهر بيتي للطائفين والقائمين والركع السجود',
    'وأذن في الناس بالحج يأتوك رجالا وعلى كل ضامر يأتين من كل فج عميق',
    'ليشهدوا منافع لهم ويذكروا اسم الله في أيام معلومات على ما رزقهم من بهيمة الأنعام فكلوا منها',
    'وأطعموا البائس الفقير ثم ليقضوا تفثهم وليوفوا نذورهم وليطوفوا بالبيت العتيق',
  ],
  [
    'بسم الله الرحمن الرحيم قل صدق الله فاتبعوا ملة إبراهيم حنيفا وما كان من المشركين',
    'إن أول بيت وضع للناس للذي ببكة مباركا وهدى للعالمين',
    'فيه آيات بينات مقام إبراهيم ومن دخله كان آمنا',
    'ولله على الناس حج البيت من استطاع إليه سبيلا ومن كفر فإن الله غني عن العالمين',
  ],
]
const EXP_UNDER = [[], ['بسم الله الرحمن الرحيم نبئ عبادي أني أنا الغفور الرحيم', 'وإذا سألك عبادي عني فإني قريب أجيب دعوة الداع إذا دعان'], ['بسم الله الرحمن الرحيم وبشر المؤمنين بأن لهم من الله فضلا كبيرا', 'ومن يعمل سوءا أو يظلم نفسه ثم يستغفر الله يجد الله غفورا رحيما'], ['بسم الله الرحمن الرحيم ذلك ومن يعظم شعائر الله فإنها من تقوى القلوب', 'وإني لغفار لمن تاب وآمن وعمل صالحا ثم اهتدى']]
const EXP_LAMPS = [['يا حي', 'يا قيوم'], ['يا رحمن', 'يا رحيم'], ['الحمد لله', 'رب العالمين']]
const EXP_JACQUARD = [
  'لا إله إلا الله محمد رسول الله',
  'يا الله يا الله',
  'سبحان الله وبحمده',
  'سبحان الله العظيم',
  'يا حنان يا منان',
]
const EXP_SITARA_BANDS = [
  'قد نرى تقلب وجهك في السماء فلنولينك قبلة ترضاها',
  'وسارعوا إلى مغفرة من ربكم وجنة عرضها السماوات والأرض أعدت للمتقين',
  'الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم',
  'لقد صدق الله رسوله الرؤيا بالحق لتدخلن المسجد الحرام إن شاء الله آمنين',
]
const EXP_FATH = ['محمد رسول الله', 'والذين معه أشداء على الكفار', 'رحماء بينهم تراهم ركعا سجدا']
const EXP_ZUMAR = ['قل يا عبادي الذين أسرفوا على أنفسهم لا تقنطوا من رحمة الله', 'إن الله يغفر الذنوب جميعا إنه هو الغفور الرحيم']
const EXP_TAWHID = 'لا إله إلا الله الملك الحق المبين محمد رسول الله الصادق الوعد الأمين'
const EXP_IKHLAS = ['قل هو الله أحد', 'الله الصمد', 'لم يلد ولم يولد', 'ولم يكن له كفوا أحد']

const PUBLIC = join(process.cwd(), 'public')
const meta = JSON.parse(readFileSync(join(PUBLIC, MODEL_BASE, 'haram_meta.json'), 'utf8')) as { kaaba: KaabaMeta }

/** Имена узлов props.glb из JSON-заголовка файла (без загрузчика three.js) */
function glbNodeNames(file: string): string[] {
  const b = readFileSync(file)
  const len = b.readUInt32LE(12)
  const json = JSON.parse(b.subarray(20, 20 + len).toString('utf8')) as { nodes: { name?: string }[] }
  return json.nodes.map(n => n.name ?? '')
}

/** Поддельный 2D-контекст: всё принимает, ширина текста ≈ длина × кегль / 2, надписи записываются */
function fakeCtx(drawn: string[]): CanvasRenderingContext2D {
  const store: Record<string, unknown> = { font: '10px serif' }
  const fns: Record<string, unknown> = {
    fillText: (s: string) => { drawn.push(s) },
    measureText: (s: string) => ({ width: s.length * (Number(/(\d+(?:\.\d+)?)px/.exec(String(store.font))?.[1]) || 10) * 0.5 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  }
  return new Proxy({}, {
    get: (_t, k: string) => (k in fns ? fns[k] : k in store ? store[k] : () => {}),
    set: (_t, k: string, v) => { store[k] = v; return true },
  }) as CanvasRenderingContext2D
}

let drawn: string[] = []
beforeEach(() => {
  drawn = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCtx(drawn))
})
afterEach(() => { vi.restoreAllMocks() })

/** Надпись нарисована целиком или двумя ярусами (разрыв по пробелу ближе к середине) */
const wasDrawn = (s: string) => {
  if (drawn.includes(s)) return true
  const two = splitHalf(s)
  return !!two && drawn.includes(two[0]) && drawn.includes(two[1])
}

/** Haram с кисвой и ситарой, props с шазарваном, Йеменским углом, кольцом и фигурой (её брать нельзя) */
function scene() {
  const haram = new Group()
  const kiswa = new Mesh(new BoxGeometry(), new MeshPhysicalMaterial({ name: 'kiswa' }))
  const oldSitara = new MeshStandardMaterial({ name: 'sitara' })
  const sitara = new Mesh(new BoxGeometry(), oldSitara)
  sitara.name = 'sitara'
  haram.add(kiswa, sitara)
  const props = new Group()
  for (const n of ['shazarwan', 'yemeni', 'fig_m_far']) { const g = new Group(); g.name = n; props.add(g) }
  const ring = new Mesh(new BoxGeometry(0.1, 0.1, 0.02), new MeshStandardMaterial())
  ring.name = 'kiswa_ring'
  props.add(ring)
  const asked: string[] = []
  const pick = (n: string): Object3D | null => {
    asked.push(n)
    return PROP_NODES.includes(n) && !isForbiddenNode(n) ? props.getObjectByName(n) ?? null : null
  }
  const cut = vi.fn()
  return { haram, kiswa, sitara, oldSitara, pick, asked, cut }
}

const build = () => { const s = scene(); return { s, d: buildKaabaDecor({ haram: s.haram, kaaba: meta.kaaba, pick: s.pick, cut: s.cut }) } }

/** Панели по размеру (ширина × высота плоскости, м) */
const panels = (g: Group, w: number, h: number) => g.children.filter(o => {
  const p = ((o as Mesh).geometry as PlaneGeometry | undefined)?.parameters
  return (o as Mesh).geometry?.type === 'PlaneGeometry' && Math.abs(p.width - w) < 1e-6 && Math.abs(p.height - h) < 1e-6
})

describe('тексты — символ в символ из сверки кисвы 23.11.2026', () => {
  test('хизам: 4 стены × 4 куска, строки отчёта (П1)', () => {
    expect(HIZAM).toEqual(EXP_HIZAM)
    expect(HIZAM.flat()).toHaveLength(16)
  })
  test('сура 112, рамки под хизамом (П2), лампы (П2), жаккард (П3)', () => {
    expect(IKHLAS).toEqual(EXP_IKHLAS)
    expect(UNDER_HIZAM).toEqual(EXP_UNDER)
    expect(LAMPS).toEqual(EXP_LAMPS)
    expect(JACQUARD).toEqual(EXP_JACQUARD)
  })
  test('ситара (П4): пояса, круг 48:29, пояс 39:53, кусок 4, медальоны', () => {
    expect(SITARA_BANDS).toEqual(EXP_SITARA_BANDS)
    expect(SITARA_FATH).toEqual(EXP_FATH)
    expect(SITARA_ZUMAR).toEqual(EXP_ZUMAR)
    expect(SITARA_TAWHID).toBe(EXP_TAWHID)
    expect(SITARA_MEDALLIONS).toEqual(['الله ربي', 'الله حسبي'])
  })
})

describe('надписи на холстах', () => {
  test('нарисовано всё из отчёта; посвящения с именем короля, «الله أكبر» и старых текстов нет', () => {
    const { d } = build()
    const all = [...HIZAM.flat(), ...IKHLAS, ...UNDER_HIZAM.flat(), ...LAMPS.flat(), ...JACQUARD,
      ...SITARA_BANDS, ...SITARA_FATH, ...SITARA_ZUMAR, SITARA_TAWHID, ...SITARA_MEDALLIONS]
    for (const s of all) expect(wasDrawn(s), s).toBe(true)
    for (const bad of ['صنعت', 'خادم الحرمين', 'فهد', 'سلمان', 'الله أكبر', 'يا كريم', 'الله جل جلاله', 'يا ديان'])
      expect(drawn.filter(s => s.includes(bad)), bad).toEqual([])
    d.dispose()
  })
  test('длинный аят мельче читаемого — два яруса по пробелу ближе к середине; короткий — одной строкой', () => {
    const x = fakeCtx([])
    const long = HIZAM[1][3]
    const t = layoutText(x, long, 698, 200, 64, 30)
    expect(t.lines).toEqual(splitHalf(long))
    expect(t.lines.join(' ')).toBe(long)
    expect(t.px).toBeGreaterThan(layoutText(x, long, 698, 200, 64, 0).px)   // двумя ярусами крупнее, чем одной строкой
    expect(layoutText(x, 'الله الصمد', 698, 200, 64, 30).lines).toEqual(['الله الصمد'])
  })
})

describe('подсчёты', () => {
  test('16 кусков хизама, 4 самадии, 12 ламп, 6 рамок с аятами', () => {
    const { d } = build()
    const hz = d.group.children.filter(o => Math.abs(((o as Mesh).geometry as PlaneGeometry | undefined)?.parameters?.height - 0.95) < 1e-6)
    expect(hz).toHaveLength(16)
    expect(panels(d.group, 1.0, 1.0)).toHaveLength(4)
    expect(panels(d.group, 0.95, 1.5)).toHaveLength(12)
    expect(panels(d.group, 2.0, 1.2)).toHaveLength(6)
    d.dispose()
  })
  test('колец кисвы — ровно 60 (официально 60)', () => {
    const { d } = build()
    const im = d.group.children.find(o => (o as InstancedMesh).isInstancedMesh) as InstancedMesh
    expect(im.count).toBe(60)
    d.dispose()
  })
})

describe('узлы props.glb', () => {
  test('в PROP_NODES есть шазарван и Йеменский угол, вера их не запрещает', () => {
    for (const n of ['shazarwan', 'yemeni']) { expect(PROP_NODES).toContain(n); expect(isForbiddenNode(n)).toBe(false) }
  })
  test('такие узлы есть в props.glb (и кольцо кисвы)', () => {
    const names = glbNodeNames(join(PUBLIC, MODEL_BASE, 'props.glb'))
    for (const n of ['shazarwan', 'yemeni', 'kiswa_ring']) expect(names).toContain(n)
  })
  test('сборка просит только разрешённые узлы', () => {
    const { s, d } = build()
    expect(typeof buildKaabaDecor).toBe('function')
    expect(s.asked.every(n => PROP_NODES.includes(n))).toBe(true)
    expect(d.group.getObjectByName('shazarwan')).toBeTruthy()
    d.dispose()
  })
})

describe('расстановка', () => {
  test('Йеменский угол — в угол C; простой цоколь вырезается полосой снаружи стен ниже 0,35 м', () => {
    const { s, d } = build()
    const [cx, cy] = meta.kaaba.C
    expect(d.group.getObjectByName('yemeni')!.position.toArray()).toEqual([cx, 0, -cy])
    expect(s.cut).toHaveBeenCalledTimes(1)
    const [mats, hit] = s.cut.mock.calls[0] as [string[], (v: Vector3) => number]
    expect(mats).toEqual(['marble'])
    const [ax, ay] = meta.kaaba.A, [bx, by] = meta.kaaba.B
    const l = Math.hypot(bx - ax, by - ay), nx = (by - ay) / l, ny = -(bx - ax) / l, mx = (ax + bx) / 2, my = (ay + by) / 2
    expect(hit(new Vector3(mx + nx * 0.3, 0.2, -(my + ny * 0.3)))).toBe(2)   // скат у стены двери
    expect(hit(new Vector3(mx + nx * 0.3, 0, -(my + ny * 0.3)))).toBe(1)     // пол — только вместе с другими
    expect(hit(new Vector3(mx + nx * 0.3, 0.5, -(my + ny * 0.3)))).toBe(0)   // выше цоколя
    expect(hit(new Vector3(mx + nx * 2, 0.2, -(my + ny * 2)))).toBe(0)       // пол матафа дальше
    d.dispose()
  })
  test('кусок 1 хизама на стене двери — справа, вынос 3 см наружу, высота из meta, плоскость смотрит наружу', () => {
    const { d } = build()
    const [ax, ay] = meta.kaaba.A, [bx, by] = meta.kaaba.B
    const l = Math.hypot(bx - ax, by - ay), nx = (by - ay) / l, ny = -(bx - ax) / l, t = 0.99 - 0.245 / 2
    const p = d.group.children[0] as Mesh
    expect(p.position.y).toBeCloseTo((meta.kaaba.hizam[0] + meta.kaaba.hizam[1]) / 2, 6)
    expect(p.position.x).toBeCloseTo(ax + (bx - ax) * t + nx * 0.03, 6)
    expect(p.position.z).toBeCloseTo(-(ay + (by - ay) * t + ny * 0.03), 6)
    const normal = new Vector3(0, 0, 1).applyQuaternion(p.quaternion)
    expect(normal.x).toBeCloseTo(nx, 6)
    expect(normal.z).toBeCloseTo(-ny, 6)
    d.dispose()
  })
  test('панели под хизамом на одной стене не наезжают друг на друга и самадия не заходит под ситару', () => {
    const { d } = build()
    const under = d.group.children.slice(16).filter(o => (o as Mesh).geometry?.type === 'PlaneGeometry') as Mesh[]
    for (let w = 0; w < 4; w++) {
      const [a, b] = [[meta.kaaba.A, meta.kaaba.B], [meta.kaaba.B, meta.kaaba.D], [meta.kaaba.D, meta.kaaba.C], [meta.kaaba.C, meta.kaaba.A]][w]
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]), ex = (b[0] - a[0]) / l, ey = (b[1] - a[1]) / l
      const spans = under.map(m => {
        const along = (m.position.x - a[0]) * ex + (-m.position.z - a[1]) * ey, across = (m.position.x - a[0]) * ey - (-m.position.z - a[1]) * ex
        const hw = (m.geometry as PlaneGeometry).parameters.width / 2
        return { s0: along - hw, s1: along + hw, onWall: Math.abs(across - 0.06) < 1e-6 && along > 0 && along < l }
      }).filter(p => p.onWall).sort((p, q) => p.s0 - q.s0)
      for (let i = 1; i < spans.length; i++) expect(spans[i].s0).toBeGreaterThanOrEqual(spans[i - 1].s1 - 1e-6)
      if (w === 0) expect(spans[0].s1).toBeLessThanOrEqual(meta.kaaba.sitara[0])
    }
    d.dispose()
  })
  test('ситара получает шитьё (старый материал освобождён), кисва — жаккард со своим ключом программы', () => {
    const s = scene()
    const spy = vi.spyOn(s.oldSitara, 'dispose')
    const d = buildKaabaDecor({ haram: s.haram, kaaba: meta.kaaba, pick: s.pick, cut: s.cut })
    expect(s.sitara.material).not.toBe(s.oldSitara)
    expect(spy).toHaveBeenCalled()
    expect((s.kiswa.material as MeshPhysicalMaterial).customProgramCacheKey()).toBe('kaaba-kiswa')
    d.dispose()
  })
})

describe('шрифт Amiri', () => {
  test('нет загрузки шрифтов — false, без падения (рисуем запасным из K_FONT)', async () => {
    await expect(kaabaFontReady(50)).resolves.toBe(false)
  })
  test('сеть упала — false, без падения', async () => {
    const fonts = { load: vi.fn(() => Promise.reject(new Error('offline'))), forEach: () => {}, add: vi.fn() }
    vi.stubGlobal('FontFace', class { family: string; constructor(f: string) { this.family = f } })
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true })
    await expect(kaabaFontReady(50)).resolves.toBe(false)
    expect(fonts.add).toHaveBeenCalled()   // @font-face не нашёлся — зарегистрирован тот же файл
    Object.defineProperty(document, 'fonts', { value: undefined, configurable: true })
    vi.unstubAllGlobals()
  })
})
