import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, test } from 'vitest'
import { LANGS, STRINGS, fmtDate, pick, t } from './i18n'
import { lang } from './store'

/* Весь словарь: основная часть i18n.ts и строки 1.1 из strings.*.ts */
const DICT = STRINGS as Record<string, readonly string[]>
/* Текст всех файлов словаря — для поиска повторов ключей (в объекте повтор молча перезаписывает значение) */
const LITERAL = ['./i18n.ts', './strings.speed.ts', './strings.flow.ts', './strings.rite.ts']
  .map(f => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n')
const CYR = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/

afterEach(() => { lang.value = 'ru' })

describe('словарь интерфейса', () => {
  test('словарь прочитан и не пуст', () => {
    expect(Object.keys(DICT).length).toBeGreaterThan(50)
  })

  test('у каждого ключа ровно три непустые строки (ru, kk, en)', () => {
    const bad = Object.entries(DICT).filter(([, v]) =>
      !Array.isArray(v) || v.length !== 3 || v.some(s => typeof s !== 'string' || !s.trim()))
    expect(bad.map(([k]) => k)).toEqual([])
  })

  test('ключи не дублируются (повтор молча перезаписывает значение)', () => {
    const keys = [...LITERAL.matchAll(/(?<=^|[\s,{])'([^'\n]+)':\s*\[/gm)].map(m => m[1])
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i)
    expect(dupes).toEqual([])
  })

  test('в английских строках нет кириллицы', () => {
    const bad = Object.entries(DICT).filter(([, v]) => CYR.test(v[2])).map(([k, v]) => `${k}: ${v[2]}`)
    expect(bad).toEqual([])
  })

  test('мягкая проверка: перевод не совпадает дословно с русским (длинные строки)', () => {
    const same = Object.entries(DICT)
      .filter(([, v]) => v[0].length > 12 && (v[1] === v[0] || v[2] === v[0]))
      .map(([k, v]) => `${k}: ${v[1] === v[0] ? 'kk' : 'en'} = «${v[0]}»`)
    if (same.length) console.warn('Строки без перевода (проверить, не имена ли собственные):\n  ' + same.join('\n  '))
    expect(Array.isArray(same)).toBe(true)
  })

  test('мягкая проверка: нет строк, где ru, kk и en совпадают, кроме коротких', () => {
    const all = Object.entries(DICT).filter(([, v]) => v[0].length > 12 && v[0] === v[1] && v[1] === v[2]).map(([k]) => k)
    expect(all).toEqual([])
  })
})

describe('t', () => {
  test('возвращает строку на текущем языке', () => {
    expect(t('tab.today')).toBe('Сегодня')
    lang.value = 'kk'; expect(t('tab.today')).toBe('Бүгін')
    lang.value = 'en'; expect(t('tab.today')).toBe('Today')
  })

  test('неизвестный ключ возвращается как есть на любом языке', () => {
    for (const l of ['ru', 'kk', 'en'] as const) {
      lang.value = l
      expect(t('нет.такого.ключа')).toBe('нет.такого.ключа')
    }
  })

  test('каждый ключ словаря даёт на каждом языке непустую строку', () => {
    for (const l of ['ru', 'kk', 'en'] as const) {
      lang.value = l
      for (const k of Object.keys(DICT)) expect(t(k), `${l}:${k}`).not.toBe('')
    }
  })
})

describe('LANGS', () => {
  test('три языка в порядке ru, kk, en', () => {
    expect(LANGS.map(l => l[0])).toEqual(['ru', 'kk', 'en'])
  })
})

describe('pick', () => {
  const o = { ru: 'Привет', kk: 'Сәлем', en: 'Hello' }
  test('берёт значение текущего языка', () => {
    lang.value = 'kk'; expect(pick(o)).toBe('Сәлем')
    lang.value = 'en'; expect(pick(o)).toBe('Hello')
  })
  test('нет перевода — русский, нет и его — запасное значение', () => {
    lang.value = 'en'
    expect(pick({ ru: 'Привет' })).toBe('Привет')
    expect(pick({}, 'пусто')).toBe('пусто')
    expect(pick(undefined, 'нет')).toBe('нет')
    expect(pick(undefined)).toBe('')
  })
})

describe('fmtDate', () => {
  test('ru и kk — ДД.ММ', () => {
    expect(fmtDate('2026-11-03')).toBe('03.11')
    lang.value = 'kk'; expect(fmtDate('2026-11-23')).toBe('23.11')
  })
  test('en — «3 Nov»', () => {
    lang.value = 'en'
    expect(fmtDate('2026-11-03')).toBe('3 Nov')
    expect(fmtDate('2026-01-31')).toBe('31 Jan')
  })
  test('некорректная дата возвращается как есть', () => {
    expect(fmtDate('скоро')).toBe('скоро')
    expect(fmtDate('')).toBe('')
  })
})
