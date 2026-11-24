/* Этап 1а «Харам заранее (3D)»: чистая логика просмотрщика — выбор слоя, ошибки Google, флаг «до завтра»,
   виды камеры, длина пути и минуты, направление тавафа */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { memoryStorage } from '../../tests/helpers/memoryStorage'
import {
  BLACK_STONE, BLOCK_KEY, GOOGLE_VIEWS, KAABA_CENTER, MODEL_BASE, MODEL_URLS, OUR_VIEWS, PROP_NODES, chooseLayer, classifyGoogleError, isBlockedToday, isQuotaError,
  isForbiddenNode, pathLength, saiEnds, setBlockedToday, signedArea, toCcw, viewsOf, walkMinutes,
} from './haram3d'

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()) })
afterEach(() => { vi.unstubAllGlobals() })

describe('chooseLayer — какой слой показать и почему', () => {
  const ok = { online: true, hasKey: true, blockedToday: false, wanted: 'google' as const }

  test('всё есть — Фото-3D Google', () => {
    expect(chooseLayer(ok)).toEqual({ layer: 'google', reason: 'ok' })
  })
  test('паломник сам выбрал нашу модель — наша, причина «выбрано»', () => {
    expect(chooseLayer({ ...ok, wanted: 'ours' })).toEqual({ layer: 'ours', reason: 'chosen' })
  })
  test('нет ключа — наша модель, причина «ключ не настроен» (даже без сети: ключа нет — честнее)', () => {
    expect(chooseLayer({ ...ok, hasKey: false })).toEqual({ layer: 'ours', reason: 'nokey' })
    expect(chooseLayer({ ...ok, hasKey: false, online: false })).toEqual({ layer: 'ours', reason: 'nokey' })
  })
  test('нет интернета — наша модель', () => {
    expect(chooseLayer({ ...ok, online: false })).toEqual({ layer: 'ours', reason: 'offline' })
  })
  test('лимит на сегодня исчерпан — наша модель', () => {
    expect(chooseLayer({ ...ok, blockedToday: true })).toEqual({ layer: 'ours', reason: 'quota' })
  })
  test('Фото-3D уже упало в этом открытии — наша модель, причина «не загрузилось»', () => {
    expect(chooseLayer({ ...ok, failed: true })).toEqual({ layer: 'ours', reason: 'failed' })
  })
})

describe('ошибки Google: лимит, отказ, сеть', () => {
  test('429 — всегда лимит', () => {
    expect(isQuotaError({ status: 429 })).toBe(true)
    expect(classifyGoogleError({ status: 429 })).toBe('quota')
  })
  test('403 с quota / rateLimit / RESOURCE_EXHAUSTED в тексте — лимит', () => {
    expect(isQuotaError({ status: 403, message: 'Quota exceeded for quota metric' })).toBe(true)
    expect(isQuotaError({ status: 403, message: '{"reason":"rateLimitExceeded"}' })).toBe(true)
    expect(isQuotaError({ status: 403, message: 'RESOURCE_EXHAUSTED' })).toBe(true)
  })
  test('403 без слов о лимите — отказ (ключ, ограничение по сайту), не лимит', () => {
    expect(isQuotaError({ status: 403, message: 'API key not valid' })).toBe(false)
    expect(classifyGoogleError({ status: 403, message: 'PERMISSION_DENIED' })).toBe('denied')
  })
  test('код ответа берётся из текста ошибки библиотеки', () => {
    expect(classifyGoogleError(new Error('GoogleCloudAuth: Failed to load data with error code 429'))).toBe('quota')
    expect(classifyGoogleError(new Error('GoogleCloudAuth: Failed to load data with error code 401'))).toBe('denied')
  })
  test('сбой сети (fetch бросил TypeError) — сеть', () => {
    expect(classifyGoogleError(new TypeError('Failed to fetch'))).toBe('network')
    expect(classifyGoogleError(new TypeError('Load failed'))).toBe('network')
  })
  test('прочее — other', () => {
    expect(classifyGoogleError(new Error('что-то иное'))).toBe('other')
    expect(classifyGoogleError(null)).toBe('other')
    expect(classifyGoogleError({ status: 500 })).toBe('other')
  })
})

describe('флаг «фото-3D недоступно до завтра» (дата по Казахстану)', () => {
  test('нет флага — не заблокировано', () => {
    expect(isBlockedToday('2026-11-23')).toBe(false)
  })
  test('поставили сегодня — заблокировано сегодня, завтра уже нет', () => {
    setBlockedToday('2026-11-23')
    expect(localStorage.getItem(BLOCK_KEY)).toBe('2026-11-23')
    expect(isBlockedToday('2026-11-23')).toBe(true)
    expect(isBlockedToday('2026-11-24')).toBe(false)
  })
  test('localStorage недоступен (приватный режим) — не падаем, считаем «не заблокировано»', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } })
    expect(() => setBlockedToday('2026-11-23')).not.toThrow()
    expect(isBlockedToday('2026-11-23')).toBe(false)
  })
})

describe('виды камеры', () => {
  test('у Фото-3D — город, Харам, путь от отеля, Масъа сверху', () => {
    expect(GOOGLE_VIEWS.map(v => v.id)).toEqual(['city', 'haram', 'route', 'masaa'])
    expect(viewsOf('google')).toBe(GOOGLE_VIEWS)
  })
  test('у нашей модели — Кааба вблизи, таваф, сай, Харам', () => {
    expect(OUR_VIEWS.map(v => v.id)).toEqual(['kaaba', 'tawaf', 'sai', 'haram'])
    expect(viewsOf('ours')).toBe(OUR_VIEWS)
  })
  test('«Кааба вблизи» — как на старой странице: сверху под 30–40°, Кааба целиком, к камере угол Чёрного камня и дверь', () => {
    const v = OUR_VIEWS.find(x => x.id === 'kaaba')!
    const dx = v.pos[0] - v.target[0], dy = v.pos[1] - v.target[1], dz = v.pos[2] - v.target[2]
    const elev = (Math.atan2(dz, Math.hypot(dx, dy)) * 180) / Math.PI
    expect(elev).toBeGreaterThanOrEqual(30)
    expect(elev).toBeLessThanOrEqual(40)
    const d = Math.hypot(v.pos[0] - KAABA_CENTER[0], v.pos[1] - KAABA_CENTER[1], v.pos[2])
    expect(d).toBeGreaterThanOrEqual(55)   // ближе Кааба не помещается по ширине портретного кадра 390 × 844
    expect(d).toBeLessThanOrEqual(90)
    // цель — у Каабы (в пределах 6 м от центра), камера со стороны угла Чёрного камня
    expect(Math.hypot(v.target[0] - KAABA_CENTER[0], v.target[1] - KAABA_CENTER[1])).toBeLessThan(6)
    const sx = BLACK_STONE[0] - KAABA_CENTER[0], sy = BLACK_STONE[1] - KAABA_CENTER[1]
    expect((v.pos[0] - KAABA_CENTER[0]) * sx + (v.pos[1] - KAABA_CENTER[1]) * sy).toBeGreaterThan(0)
    // дверь — на стене A–B (угол камня → угол Ирака): камера по ту же сторону этой стены, что и наружа
    const [ax, ay] = [6.26, -2.06], [bx, by] = [-0.21, 7.62]
    const side = (x: number, y: number) => (bx - ax) * (y - ay) - (by - ay) * (x - ax)
    expect(Math.sign(side(v.pos[0], v.pos[1]))).toBe(-Math.sign(side(KAABA_CENTER[0], KAABA_CENTER[1])))
    expect(v.pos[2]).toBeGreaterThan(v.target[2])
  })
  test('в виде «Сай» прячутся верхние ярусы Масъа, в остальных — нет', () => {
    expect(OUR_VIEWS.filter(v => v.cutMasaa).map(v => v.id)).toEqual(['sai'])
  })
  test('у каждого вида камера выше земли и не совпадает с целью', () => {
    for (const v of [...GOOGLE_VIEWS, ...OUR_VIEWS]) {
      expect(v.pos[2]).toBeGreaterThan(0)
      expect(Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2])).toBeGreaterThan(5)
    }
  })
})

describe('путь и минуты', () => {
  test('длина ломаной в метрах', () => {
    expect(pathLength([[0, 0], [3, 4], [3, 10]])).toBeCloseTo(11)
    expect(pathLength([])).toBe(0)
    expect(pathLength([[1, 1]])).toBe(0)
  })
  test('673 м — «8–9 минут» (шаг 4,5–5 км/ч)', () => {
    expect(walkMinutes(673)).toEqual([8, 9])
  })
  test('короткий путь — не меньше минуты', () => {
    expect(walkMinutes(20)).toEqual([1, 1])
  })
})

describe('таваф — против часовой стрелки, если смотреть сверху', () => {
  const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]]   // против часовой (восток → север)
  test('площадь со знаком: против часовой > 0', () => {
    expect(signedArea(square)).toBeGreaterThan(0)
    expect(signedArea([...square].reverse())).toBeLessThan(0)
  })
  test('toCcw: по часовой — разворачивает, против — оставляет как есть, исходник не меняет', () => {
    const cw = [...square].reverse()
    const copy = cw.map(p => [...p])
    expect(signedArea(toCcw(cw))).toBeGreaterThan(0)
    expect(cw).toEqual(copy)
    expect(toCcw(square)).toEqual(square)
  })
})

describe('сай', () => {
  test('концы — Сафа и Марва из meta.spots', () => {
    const e = saiEnds({ safa: [135.83, -75.36, 12], marwa: [91.41, 301.79, 12] })
    expect(e).toEqual({ safa: [135.83, -75.36], marwa: [91.41, 301.79] })
  })
  test('нет точек — null', () => {
    expect(saiEnds({})).toBeNull()
  })
})

describe('вера: фигуры людей — только у толпы и с нуром; героя и птиц нет', () => {
  test('узлы fig_*, bird, hero, cup — запрещены', () => {
    for (const n of ['fig_m_far', 'fig_w_near_mesh', 'bird', 'hero', 'hero_upper', 'cup']) expect(isForbiddenNode(n)).toBe(true)
  })
  test('fig_* — только толпе (allowCrowd): мужчина и женщина всех уровней детализации', () => {
    for (const n of ['fig_m_hi', 'fig_m_near', 'fig_m_mid', 'fig_m_far', 'fig_m_xfar', 'fig_w_hi', 'fig_w_xfar', 'fig_m_hi_pol_mesh', 'fig_w_near_mesh']) {
      expect(isForbiddenNode(n, { allowCrowd: true }), n).toBe(false)
      expect(isForbiddenNode(n), n).toBe(true)   // без разрешения толпы — по-прежнему запрещены
    }
  })
  test('hero, его чаша, птицы и прочие fig_* запрещены даже толпе', () => {
    for (const n of ['hero', 'hero_upper', 'cup', 'bird', 'bird_wing', 'fig_police', 'fig_m_hi_extra', 'fig_x_near'])
      expect(isForbiddenNode(n, { allowCrowd: true }), n).toBe(true)
  })
  test('святыни и предметы — разрешены', () => {
    for (const n of ['maqam', 'hatim', 'mizab', 'shazarwan', 'yemeni', 'kiswa_ring', 'barrier', 'gallery_dome']) expect(isForbiddenNode(n)).toBe(false)
  })
  test('из props.glb берём только разрешённые узлы', () => {
    expect(PROP_NODES.length).toBeGreaterThan(0)
    expect(PROP_NODES.filter(n => isForbiddenNode(n))).toEqual([])
    for (const n of ['maqam', 'hatim', 'mizab', 'shazarwan', 'yemeni']) expect(PROP_NODES).toContain(n)
  })
})

describe('файлы модели для офлайна', () => {
  test('все — в каталоге с версией /haram3d/v1/: три glb, метаданные, путь от отеля и декодер Draco', () => {
    expect(MODEL_BASE).toMatch(/^\/haram3d\/v\d+\/$/)
    expect(MODEL_URLS.every(u => u.startsWith(MODEL_BASE))).toBe(true)
    for (const f of ['haram.glb', 'props.glb', 'haram_city.glb', 'haram_meta.json', 'walk_route.json', 'draco/draco_decoder.wasm', 'draco/draco_wasm_wrapper.js'])
      expect(MODEL_URLS).toContain(MODEL_BASE + f)
  })
  test('каждый файл из списка лежит в public/', () => {
    for (const u of MODEL_URLS) expect(existsSync(join(process.cwd(), 'public', u)), u).toBe(true)
  })
})
