import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { CONTENT_FILES, ARABIC, compare, type Lang } from './helpers/compareContent'

const BASE = new URL('../public/content/', import.meta.url)
const load = (rel: string): unknown => JSON.parse(readFileSync(new URL(rel, BASE), 'utf8'))
const exists = (rel: string) => existsSync(new URL(rel, BASE))

interface Step { id: string; num: number; html: string; title: string }
interface DuaEntry { id: string; items: { ar: string }[]; html: string }

describe('русский контент', () => {
  const steps = load('steps.json') as Step[]
  const dua = load('dua.json') as DuaEntry[]

  test('одиннадцать шагов умры с уникальными id', () => {
    expect(steps).toHaveLength(11)
    expect(new Set(steps.map(s => s.id)).size).toBe(11)
  })

  test('номера шагов — подряд от 1 до 11', () => {
    expect(steps.map(s => s.num)).toEqual(Array.from({ length: 11 }, (_, k) => k + 1))
  })

  test('у каждого шага есть заголовок и html', () => {
    for (const s of steps) { expect(s.title, s.id).toBeTruthy(); expect(s.html, s.id).toBeTruthy() }
  })

  test.each(['tawaf', 'sai'])('в шаге «%s» есть подсказки кругов data-hint-1…7', id => {
    const html = steps.find(s => s.id === id)!.html
    for (let k = 1; k <= 7; k++) expect(html, `data-hint-${k}`).toMatch(new RegExp(`data-hint-${k}="[^"]+"`))
  })

  test('у каждого дуа есть арабский текст', () => {
    expect(dua.length).toBeGreaterThan(0)
    for (const d of dua) {
      expect(d.items.length, d.id).toBeGreaterThan(0)
      for (const it of d.items) expect(it.ar.match(ARABIC), d.id).not.toBeNull()
    }
  })

  test('id дуа уникальны', () => {
    expect(new Set(dua.map(d => d.id)).size).toBe(dua.length)
  })

  test.each(CONTENT_FILES)('файл %s.json — корректный JSON', f => {
    expect(() => load(`${f}.json`)).not.toThrow()
  })
})

describe('сверка на реальных данных (проверка самого сравнивателя)', () => {
  test.each(CONTENT_FILES)('%s.json совпадает сам с собой без ошибок', f => {
    const ru = load(`${f}.json`)
    expect(compare(ru, structuredClone(ru), f, 'kk').errors).toEqual([])
  })

  test('потерянный тег в html шага замечается', () => {
    const steps = structuredClone(load('steps.json')) as Step[]
    steps[0].html = steps[0].html.replace('</p>', '')
    expect(compare(load('steps.json'), steps, 'steps', 'kk').errors.join('\n')).toMatch(/steps\[0\]\.html: разметка изменена/)
  })

  test('изменённый id пункта в pack замечается', () => {
    const pack = structuredClone(load('pack.json')) as { groups: { i: string[][] }[] }
    pack.groups[0].i[0][0] = 'other'
    expect(compare(load('pack.json'), pack, 'pack', 'kk').errors.join('\n')).toMatch(/id пункта/)
  })
})

/* Переводы пишутся параллельно и могут быть неполными: отсутствующие папки и файлы пропускаются. */
for (const lang of ['kk', 'en'] as Lang[]) {
  describe(`перевод ${lang}`, () => {
    if (!exists(`${lang}/`)) test.skip(`папки public/content/${lang}/ ещё нет`, () => {})
    for (const f of CONTENT_FILES) {
      const rel = `${lang}/${f}.json`
      describe(f, () => {
        test.skipIf(!exists(rel))('это валидный JSON', () => {
          expect(() => load(rel)).not.toThrow()
        })
        test.skipIf(!exists(rel))('структура совпадает с русским оригиналом', () => {
          const { errors, warnings } = compare(load(`${f}.json`), load(rel), f, lang)
          if (warnings.length) console.warn(`${rel}:\n  ` + warnings.slice(0, 15).join('\n  '))
          expect(errors.slice(0, 25)).toEqual([])
        })
      })
    }
  })
}
